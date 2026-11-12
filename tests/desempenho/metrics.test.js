// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mean, calculateKpis, calculateDistribution, calculateDimensionStats, calculatePeriodAverages,
  calculateStreak, calculateLevel, trendSlope, calculateQuarterStats,
} from '../../desempenho/lib/metrics.js';
import { scoreMeetings } from '../../desempenho/lib/scoring.js';
import { getPeriod } from '../../desempenho/lib/periods.js';
import { meeting, dims } from './helpers.js';

const close = (/** @type {number | null} */ a, /** @type {number} */ b) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('média ignora nulos', () => {
  assert.equal(mean([8, null, 9, undefined]), 8.5);
  assert.equal(mean([]), null);
});

test('KPIs: média, delta, cobertura e taxa na meta', () => {
  const cur = scoreMeetings([
    meeting({ ai: 9, human: 9 }),
    meeting({ ai: 7, human: 7 }),
    meeting({ ai: 8, human: null }), // provisória
    meeting({}),                       // realizada sem nota
    meeting({ status: 'no_show' }),
  ]);
  const prev = scoreMeetings([meeting({ ai: 7, human: 7 }), meeting({ ai: 8, human: 8 })]);
  const k = calculateKpis(cur, prev, 8);
  close(k.average, 8);
  close(k.previousAverage, 7.5);
  close(k.delta, 0.5);
  close(k.deltaPct, 0.5 / 7.5);
  assert.equal(k.held, 4);
  assert.equal(k.evaluated, 3);
  assert.equal(k.pendingHuman, 1);
  assert.equal(k.noShows, 1);
  close(k.coverage, 0.75);
  assert.equal(k.onTarget, 2);
  close(k.targetRate, 2 / 3);
  close(k.previousTargetRate, 0.5);
  close(k.humanAverage, 8);
});

test('KPIs sem dados não quebram', () => {
  const k = calculateKpis([], [], 8);
  assert.equal(k.average, null);
  assert.equal(k.delta, null);
  assert.equal(k.coverage, null);
  assert.equal(k.targetRate, null);
});

test('distribuição por faixas inclui o 10 na última', () => {
  const ms = scoreMeetings([5, 6, 7.9, 8, 8.95, 9, 10].map((v) => meeting({ ai: v, human: v })));
  assert.deepEqual(calculateDistribution(ms).map((b) => b.count), [1, 2, 2, 2]);
  assert.equal(calculateDistribution([]).every((b) => b.share === 0), true);
});

test('subcritérios: média combinada e delta', () => {
  const cur = scoreMeetings([meeting({ ai: 8, human: 8, dimsAi: { ...dims(8), negociacao: 6 }, dimsHuman: { ...dims(8), negociacao: 7 } })]);
  const prev = scoreMeetings([meeting({ ai: 8, human: 8, dimsAi: dims(6), dimsHuman: dims(6) })]);
  const neg = calculateDimensionStats(cur, prev).find((x) => x.key === 'negociacao');
  close(neg?.average ?? null, 6.5);
  close(neg?.delta ?? null, 0.5);
  assert.equal(neg?.ai, 6);
  assert.equal(neg?.human, 7);
});

test('série temporal agrupa por dia na semana e marca futuro', () => {
  const p = getPeriod('week', new Date('2026-11-12T12:00:00'));
  const ms = scoreMeetings([
    meeting({ date: '2026-11-09T10:00:00', ai: 8, human: 9 }),
    meeting({ date: '2026-11-09T15:00:00', ai: 6, human: 7 }),
    meeting({ date: '2026-11-11T10:00:00', ai: 9, human: 9 }),
  ]);
  const b = calculatePeriodAverages(ms, p, new Date('2026-11-12T12:00:00'));
  assert.equal(b.length, 7);
  close(b[0].final, 7.5);
  assert.equal(b[0].count, 2);
  close(b[0].ai, 7);
  assert.equal(b[1].final, null);
  assert.equal(b[4].future, true);
});

test('sequência na meta conta a partir da mais recente', () => {
  const ms = scoreMeetings([
    meeting({ date: '2026-11-01T10:00:00', ai: 9, human: 9 }),
    meeting({ date: '2026-11-02T10:00:00', ai: 6, human: 6 }),
    meeting({ date: '2026-11-03T10:00:00', ai: 8, human: 8 }),
    meeting({ date: '2026-11-04T10:00:00', ai: 9, human: 8.5 }),
  ]);
  assert.equal(calculateStreak(ms, 8), 2);
});

test('nível e progresso até o próximo', () => {
  const l = calculateLevel(8.5);
  assert.equal(l?.current.name, 'Ouro');
  assert.equal(l?.next?.name, 'Diamante');
  close(l?.progress ?? null, 0.5);
  close(l?.missing ?? null, 0.5);
  assert.equal(calculateLevel(9.4)?.next, null);
  assert.equal(calculateLevel(null), null);
});

test('inclinação da tendência', () => {
  const mk = (/** @type {(number | null)[]} */ v) => v.map((final) => ({ final, ai: null, human: null, count: 1, future: false, start: new Date(), end: new Date(), label: '', longLabel: '' }));
  close(trendSlope(mk([7, 7.5, 8, 8.5])), 0.5);
  assert.equal(trendSlope(mk([7, null])), null);
});

test('médias por trimestre', () => {
  const p = getPeriod('quarter', new Date('2026-11-12T12:00:00'));
  const ms = scoreMeetings([
    meeting({ date: '2026-02-10T10:00:00', ai: 7, human: 7 }),
    meeting({ date: '2026-10-10T10:00:00', ai: 9, human: 9 }),
  ]);
  const q = calculateQuarterStats(ms, p, new Date('2026-11-12T12:00:00'));
  assert.deepEqual(q.map((x) => x.average), [7, null, null, 9]);
  assert.equal(q[3].current, true);
});
