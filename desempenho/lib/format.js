// @ts-check
/** Formatação pt-BR usada no painel (e nos textos de insight). */

const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** 8.66 → "8,7" · null → "–" @param {number | null | undefined} v */
export function fmtScore(v) {
  return typeof v === 'number' && Number.isFinite(v) ? nf1.format(v) : '–';
}

/** 0.734 → "73%" @param {number | null | undefined} v */
export function fmtPct(v) {
  return typeof v === 'number' && Number.isFinite(v) ? `${nf0.format(v * 100)}%` : '–';
}

/** +0.4 → "+0,4" · -0.2 → "−0,2" · 0 → "0,0" @param {number | null | undefined} v */
export function fmtDelta(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '–';
  const r = Math.round(v * 10) / 10;
  if (r === 0) return '0,0';
  return `${r > 0 ? '+' : '−'}${nf1.format(Math.abs(r))}`;
}

/** Variação em pontos percentuais: +0.12 → "+12 p.p." @param {number | null | undefined} v */
export function fmtPp(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '–';
  const r = Math.round(v * 100);
  if (r === 0) return '0 p.p.';
  return `${r > 0 ? '+' : '−'}${Math.abs(r)} p.p.`;
}

/** Variação relativa: 0.046 → "+4,6%" @param {number | null | undefined} v */
export function fmtDeltaPct(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '–';
  const r = Math.round(v * 1000) / 10;
  if (r === 0) return '0%';
  return `${r > 0 ? '+' : '−'}${nf1.format(Math.abs(r))}%`;
}

/** "12/11/2026" @param {string | Date} d */
export function fmtDate(d) {
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "12 nov · 14:30" @param {string | Date} d */
export function fmtDateTimeShort(d) {
  const x = typeof d === 'string' ? new Date(d) : d;
  const date = x.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const time = x.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** Singular/plural simples. @param {number} n @param {string} one @param {string} many */
export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Iniciais para avatar. @param {string} name */
export function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
