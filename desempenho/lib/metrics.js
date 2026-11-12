// @ts-check
/**
 * Cálculos estatísticos do painel. Funções puras, sem DOM e sem I/O,
 * para poderem ser testadas isoladamente (tests/desempenho/metrics.test.js).
 */
import { TARGET_SCORE, SCORE_BANDS, DIMENSIONS, LEVELS } from './config.js';
import { computeDimensionScore } from './scoring.js';
import {
  getBucketRanges, inRange, previousPeriod, shiftPeriod, quartersOfYear, isCurrentPeriod, isFuturePeriod,
} from './periods.js';

/** @typedef {import('./types.js').ScoredMeeting} ScoredMeeting */
/** @typedef {import('./types.js').Period} Period */
/** @typedef {import('./types.js').Bucket} Bucket */
/** @typedef {import('./types.js').KpiSummary} KpiSummary */
/** @typedef {import('./types.js').DistributionBand} DistributionBand */
/** @typedef {import('./types.js').DimensionStat} DimensionStat */
/** @typedef {import('./types.js').QuarterStat} QuarterStat */
/** @typedef {import('./types.js').LevelProgress} LevelProgress */
/** @typedef {{ start: Date, end: Date }} Range */

/** Média aritmética ignorando nulos. @param {ReadonlyArray<number | null | undefined>} values */
export function mean(values) {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) { sum += v; n++; }
  }
  return n ? sum / n : null;
}

/** @param {number | null} a @param {number | null} b */
export function diff(a, b) {
  return a === null || b === null ? null : a - b;
}

/** @param {number | null} a @param {number | null} b */
export function pctChange(a, b) {
  return a === null || b === null || b === 0 ? null : (a - b) / b;
}

/** Reuniões cujo início cai no intervalo. @param {ScoredMeeting[]} meetings @param {Range} range */
export function meetingsInRange(meetings, range) {
  return meetings.filter((m) => inRange(new Date(m.date), range));
}

/** Reuniões realizadas com nota final. @param {ScoredMeeting[]} meetings */
export function evaluatedMeetings(meetings) {
  return meetings.filter((m) => m.status === 'realizada' && m.score !== null);
}

/**
 * Série temporal: média da nota final (e de IA/humano) em cada fatia do período.
 * @param {ScoredMeeting[]} meetings
 * @param {Period} period
 * @param {Date} [now]
 * @returns {Bucket[]}
 */
export function calculatePeriodAverages(meetings, period, now = new Date()) {
  const evaluated = evaluatedMeetings(meetings);
  return getBucketRanges(period).map((r) => {
    const inside = evaluated.filter((m) => inRange(new Date(m.date), r));
    return {
      ...r,
      final: mean(inside.map((m) => m.score?.value)),
      ai: mean(inside.map((m) => m.score?.ai)),
      human: mean(inside.map((m) => m.score?.human)),
      count: inside.length,
      future: r.start > now,
    };
  });
}

/**
 * KPIs de um período, comparados com o período anterior.
 * @param {ScoredMeeting[]} current   Reuniões do período atual.
 * @param {ScoredMeeting[]} previous  Reuniões do período anterior.
 * @param {number} [target]
 * @returns {KpiSummary}
 */
export function calculateKpis(current, previous, target = TARGET_SCORE) {
  const held = current.filter((m) => m.status === 'realizada');
  const ev = evaluatedMeetings(current);
  const prevEv = evaluatedMeetings(previous);
  const average = mean(ev.map((m) => m.score?.value));
  const previousAverage = mean(prevEv.map((m) => m.score?.value));
  const onTarget = ev.filter((m) => (m.score?.value ?? 0) >= target).length;
  const prevOnTarget = prevEv.filter((m) => (m.score?.value ?? 0) >= target).length;
  return {
    average,
    previousAverage,
    delta: diff(average, previousAverage),
    deltaPct: pctChange(average, previousAverage),
    aiAverage: mean(ev.map((m) => m.score?.ai)),
    humanAverage: mean(ev.map((m) => m.score?.human)),
    held: held.length,
    evaluated: ev.length,
    pendingHuman: ev.filter((m) => m.score?.provisional).length,
    noShows: current.filter((m) => m.status === 'no_show').length,
    coverage: held.length ? ev.length / held.length : null,
    onTarget,
    targetRate: ev.length ? onTarget / ev.length : null,
    previousTargetRate: prevEv.length ? prevOnTarget / prevEv.length : null,
  };
}

/**
 * Distribuição das notas finais por faixa.
 * @param {ScoredMeeting[]} meetings
 * @returns {DistributionBand[]}
 */
export function calculateDistribution(meetings) {
  const values = evaluatedMeetings(meetings).map((m) => /** @type {number} */ (m.score?.value));
  const total = values.length;
  return SCORE_BANDS.map((b, i) => {
    const last = i === SCORE_BANDS.length - 1;
    const count = values.filter((v) => v >= b.min && (last ? v <= b.max : v < b.max)).length;
    return { ...b, count, share: total ? count / total : 0 };
  });
}

/**
 * Média por subcritério (IA + humano combinados), com delta vs. período anterior.
 * @param {ScoredMeeting[]} current
 * @param {ScoredMeeting[]} previous
 * @returns {DimensionStat[]}
 */
export function calculateDimensionStats(current, previous) {
  const cur = evaluatedMeetings(current);
  const prev = evaluatedMeetings(previous);
  return DIMENSIONS.map((d) => {
    const curScores = cur.map((m) => computeDimensionScore(m.evaluation, d.key));
    const average = mean(curScores.map((s) => s?.value));
    const previousAverage = mean(prev.map((m) => computeDimensionScore(m.evaluation, d.key)?.value));
    return {
      key: d.key,
      label: d.label,
      average,
      previousAverage,
      delta: diff(average, previousAverage),
      ai: mean(curScores.map((s) => s?.ai)),
      human: mean(curScores.map((s) => s?.human)),
    };
  });
}

/**
 * Média de cada trimestre do ano do período.
 * @param {ScoredMeeting[]} meetings
 * @param {Period} period
 * @param {Date} [now]
 * @returns {QuarterStat[]}
 */
export function calculateQuarterStats(meetings, period, now = new Date()) {
  return quartersOfYear(period.start).map((q) => {
    const ev = evaluatedMeetings(meetingsInRange(meetings, q));
    return {
      label: q.shortLabel,
      period: q,
      average: mean(ev.map((m) => m.score?.value)),
      count: ev.length,
      current: isCurrentPeriod(q, now),
      future: isFuturePeriod(q, now),
    };
  });
}

/**
 * Médias dos últimos `length` períodos (antigo → atual), para a sparkline.
 * @param {ScoredMeeting[]} meetings
 * @param {Period} period
 * @param {number} length
 */
export function calculateSparkline(meetings, period, length) {
  /** @type {(number | null)[]} */
  const out = [];
  for (let i = length - 1; i >= 0; i--) {
    const p = shiftPeriod(period, -i);
    out.push(mean(evaluatedMeetings(meetingsInRange(meetings, p)).map((m) => m.score?.value)));
  }
  return out;
}

/**
 * Sequência atual de reuniões na meta (das mais recentes para trás).
 * @param {ScoredMeeting[]} meetings
 * @param {number} [target]
 */
export function calculateStreak(meetings, target = TARGET_SCORE) {
  const sorted = evaluatedMeetings(meetings).sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  for (const m of sorted) {
    if ((m.score?.value ?? 0) >= target) streak++;
    else break;
  }
  return streak;
}

/**
 * Nível de gamificação e progresso até o próximo.
 * @param {number | null} average
 * @returns {LevelProgress | null}
 */
export function calculateLevel(average) {
  if (average === null) return null;
  let idx = 0;
  LEVELS.forEach((l, i) => { if (average >= l.min) idx = i; });
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1] ?? null;
  if (!next) return { current, next: null, progress: 1, missing: null };
  const span = next.min - current.min;
  return {
    current,
    next,
    progress: Math.min(1, Math.max(0, (average - current.min) / span)),
    missing: Math.max(0, next.min - average),
  };
}

/**
 * Inclinação (pontos por fatia) da regressão linear sobre os buckets com nota.
 * @param {Bucket[]} buckets
 */
export function trendSlope(buckets) {
  const pts = buckets
    .map((b, i) => ({ x: i, y: b.final }))
    .filter(/** @returns {p is { x: number, y: number }} */ (p) => p.y !== null);
  if (pts.length < 3) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let num = 0;
  let den = 0;
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  return den ? num / den : null;
}

export { previousPeriod };
