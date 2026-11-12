// @ts-check
/**
 * Aritmética de períodos (semana, mês, trimestre, ano) em horário local.
 * Todos os intervalos são meio-abertos: [start, end). A semana começa na segunda.
 */

/** @typedef {import('./types.js').Granularity} Granularity */
/** @typedef {import('./types.js').Period} Period */

export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Nome legível de cada granularidade (para textos como "vs. mês anterior"). */
export const GRANULARITY_LABELS = Object.freeze({
  week: { name: 'Semanal', unit: 'semana', previous: 'semana anterior', article: 'a' },
  month: { name: 'Mensal', unit: 'mês', previous: 'mês anterior', article: 'o' },
  quarter: { name: 'Trimestral', unit: 'trimestre', previous: 'trimestre anterior', article: 'o' },
  year: { name: 'Anual', unit: 'ano', previous: 'ano anterior', article: 'o' },
});

/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** @param {Date} d */
export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** @param {Date} d @param {number} n */
export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Segunda-feira da semana de `d`. @param {Date} d */
export function startOfWeek(d) {
  const day = (d.getDay() + 6) % 7; // seg = 0
  return addDays(startOfDay(d), -day);
}

/** Número da semana ISO 8601. @param {Date} d */
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** "12/11" @param {Date} d */
export function dayMonth(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** @param {Date} d */
export function quarterOf(d) {
  return Math.floor(d.getMonth() / 3) + 1;
}

/**
 * Período que contém `anchor`.
 * @param {Granularity} granularity
 * @param {Date} anchor
 * @returns {Period}
 */
export function getPeriod(granularity, anchor) {
  const y = anchor.getFullYear();
  switch (granularity) {
    case 'week': {
      const start = startOfWeek(anchor);
      const end = addDays(start, 7);
      const last = addDays(end, -1);
      return {
        granularity, start, end,
        label: `Semana ${isoWeek(start)} · ${dayMonth(start)} a ${dayMonth(last)}`,
        shortLabel: `sem. ${isoWeek(start)}`,
      };
    }
    case 'month': {
      const m = anchor.getMonth();
      return {
        granularity, start: new Date(y, m, 1), end: new Date(y, m + 1, 1),
        label: `${cap(MONTHS[m])} ${y}`, shortLabel: MONTHS_SHORT[m],
      };
    }
    case 'quarter': {
      const q = quarterOf(anchor);
      return {
        granularity, start: new Date(y, (q - 1) * 3, 1), end: new Date(y, q * 3, 1),
        label: `Q${q} ${y} · ${MONTHS_SHORT[(q - 1) * 3]}–${MONTHS_SHORT[q * 3 - 1]}`, shortLabel: `Q${q}`,
      };
    }
    case 'year':
      return { granularity, start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: `${y}`, shortLabel: `${y}` };
    default:
      throw new Error(`Granularidade desconhecida: ${String(granularity)}`);
  }
}

/**
 * Avança (n > 0) ou retrocede (n < 0) períodos inteiros.
 * @param {Period} period
 * @param {number} n
 * @returns {Period}
 */
export function shiftPeriod(period, n) {
  const s = period.start;
  switch (period.granularity) {
    case 'week': return getPeriod('week', addDays(s, 7 * n));
    case 'month': return getPeriod('month', new Date(s.getFullYear(), s.getMonth() + n, 1));
    case 'quarter': return getPeriod('quarter', new Date(s.getFullYear(), s.getMonth() + 3 * n, 1));
    case 'year': return getPeriod('year', new Date(s.getFullYear() + n, 0, 1));
    default: throw new Error('Granularidade desconhecida');
  }
}

/** @param {Period} period */
export const previousPeriod = (period) => shiftPeriod(period, -1);

/** @param {Period} period @param {Date} now */
export function isCurrentPeriod(period, now) {
  return now >= period.start && now < period.end;
}

/** Período está totalmente no futuro. @param {Period} period @param {Date} now */
export function isFuturePeriod(period, now) {
  return period.start > now;
}

/** @param {Date} d @param {{ start: Date, end: Date }} range */
export function inRange(d, range) {
  return d >= range.start && d < range.end;
}

/**
 * Fatias da série temporal de um período:
 * semana → dias · mês → semanas · trimestre → semanas · ano → meses.
 * Semanas são recortadas nas bordas do período.
 * @param {Period} period
 * @returns {{ start: Date, end: Date, label: string, longLabel: string }[]}
 */
export function getBucketRanges(period) {
  /** @type {{ start: Date, end: Date, label: string, longLabel: string }[]} */
  const out = [];
  if (period.granularity === 'week') {
    for (let i = 0; i < 7; i++) {
      const start = addDays(period.start, i);
      out.push({
        start, end: addDays(start, 1),
        label: WEEKDAYS_SHORT[start.getDay()],
        longLabel: `${cap(WEEKDAYS_SHORT[start.getDay()])}, ${dayMonth(start)}`,
      });
    }
    return out;
  }
  if (period.granularity === 'year') {
    for (let m = 0; m < 12; m++) {
      const y = period.start.getFullYear();
      out.push({
        start: new Date(y, m, 1), end: new Date(y, m + 1, 1),
        label: MONTHS_SHORT[m], longLabel: `${cap(MONTHS[m])} ${y}`,
      });
    }
    return out;
  }
  // mês e trimestre: semanas (seg–dom) recortadas no período
  let cursor = startOfWeek(period.start);
  while (cursor < period.end) {
    const next = addDays(cursor, 7);
    const start = cursor < period.start ? period.start : cursor;
    const end = next > period.end ? period.end : next;
    const last = addDays(end, -1);
    out.push({
      start, end,
      label: dayMonth(start),
      longLabel: `Semana ${isoWeek(start)} · ${dayMonth(start)} a ${dayMonth(last)}`,
    });
    cursor = next;
  }
  return mergeShortEdges(out);
}

/**
 * Semanas recortadas com até 2 dias nas bordas do período (ex.: dia 1 caindo num domingo)
 * viram parte da semana vizinha, para o gráfico não ter pontos de um dia só.
 * @param {{ start: Date, end: Date, label: string, longLabel: string }[]} buckets
 */
function mergeShortEdges(buckets) {
  const days = /** @param {{ start: Date, end: Date }} b */ (b) => Math.round((b.end.getTime() - b.start.getTime()) / 86400000);
  /** @param {Date} start @param {Date} end */
  const make = (start, end) => ({
    start, end, label: dayMonth(start), longLabel: `${dayMonth(start)} a ${dayMonth(addDays(end, -1))}`,
  });
  const out = [...buckets];
  if (out.length > 2 && days(out[0]) <= 2) out.splice(0, 2, make(out[0].start, out[1].end));
  const n = out.length;
  if (n > 2 && days(out[n - 1]) <= 2) out.splice(n - 2, 2, make(out[n - 2].start, out[n - 1].end));
  return out;
}

/** Os quatro trimestres do ano de `anchor`. @param {Date} anchor @returns {Period[]} */
export function quartersOfYear(anchor) {
  const y = anchor.getFullYear();
  return [0, 3, 6, 9].map((m) => getPeriod('quarter', new Date(y, m, 1)));
}

/**
 * Intervalo mínimo de dados necessário para desenhar o painel de um período:
 * o período anterior (delta), N períodos para a sparkline e o ano (strip de trimestres).
 * @param {Period} period
 * @param {number} sparklineLength
 */
export function requiredDataRange(period, sparklineLength) {
  const sparkStart = shiftPeriod(period, -(sparklineLength - 1)).start;
  const prevStart = previousPeriod(period).start;
  const yearStart = new Date(period.start.getFullYear(), 0, 1);
  const start = new Date(Math.min(sparkStart.getTime(), prevStart.getTime(), yearStart.getTime()));
  const yearEnd = new Date(period.start.getFullYear() + 1, 0, 1);
  const end = new Date(Math.max(period.end.getTime(), yearEnd.getTime()));
  return { start, end };
}
