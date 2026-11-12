// @ts-check
/**
 * Nota final da reunião = combinação ponderada da nota da IA com a avaliação humana.
 */
import { SCORE_WEIGHTS, PARTIAL_SCORE_POLICY, SCORE_MAX, DIMENSIONS } from './config.js';

/** @typedef {import('./types.js').Evaluation} Evaluation */
/** @typedef {import('./types.js').FinalScore} FinalScore */
/** @typedef {import('./types.js').Meeting} Meeting */
/** @typedef {import('./types.js').ScoredMeeting} ScoredMeeting */
/** @typedef {import('./types.js').DimensionKey} DimensionKey */

/** @param {number} v */
export function clampScore(v) {
  return Math.min(SCORE_MAX, Math.max(0, v));
}

/** Arredonda para 1 casa (evita 8.700000001). @param {number} v */
export function round1(v) {
  return Math.round(v * 10) / 10;
}

/** @param {unknown} v @returns {v is number} */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Combina duas notas com os pesos configurados.
 * @param {number | null | undefined} ai
 * @param {number | null | undefined} human
 * @param {{ weights?: { ai: number, human: number }, policy?: 'use-available' | 'require-both' }} [opts]
 * @returns {FinalScore | null}
 */
export function combineScores(ai, human, opts = {}) {
  const weights = opts.weights ?? SCORE_WEIGHTS;
  const policy = opts.policy ?? PARTIAL_SCORE_POLICY;
  const hasAi = isNum(ai);
  const hasHuman = isNum(human);
  const a = hasAi ? clampScore(ai) : null;
  const h = hasHuman ? clampScore(human) : null;

  if (a !== null && h !== null) {
    const total = weights.ai + weights.human;
    if (total <= 0) throw new Error('Pesos de IA e humano não podem somar zero');
    return { value: (a * weights.ai + h * weights.human) / total, source: 'ia+humana', provisional: false, ai: a, human: h };
  }
  if (policy === 'require-both') return null;
  if (a !== null) return { value: a, source: 'ia', provisional: true, ai: a, human: null };
  if (h !== null) return { value: h, source: 'humana', provisional: true, ai: null, human: h };
  return null;
}

/**
 * Nota final de uma avaliação.
 * @param {Evaluation | null | undefined} evaluation
 * @param {Parameters<typeof combineScores>[2]} [opts]
 */
export function computeFinalScore(evaluation, opts) {
  if (!evaluation) return null;
  return combineScores(evaluation.ai?.overall, evaluation.human?.overall, opts);
}

/**
 * Nota final por subcritério (mesma regra de combinação).
 * @param {Evaluation | null | undefined} evaluation
 * @param {DimensionKey} key
 * @param {Parameters<typeof combineScores>[2]} [opts]
 */
export function computeDimensionScore(evaluation, key, opts) {
  if (!evaluation) return null;
  return combineScores(evaluation.ai?.dimensions[key], evaluation.human?.dimensions[key], opts);
}

/**
 * Anexa a nota final às reuniões. Só reuniões realizadas recebem nota.
 * @param {Meeting[]} meetings
 * @param {Parameters<typeof combineScores>[2]} [opts]
 * @returns {ScoredMeeting[]}
 */
export function scoreMeetings(meetings, opts) {
  return meetings.map((m) => ({
    ...m,
    score: m.status === 'realizada' ? computeFinalScore(m.evaluation, opts) : null,
  }));
}

/**
 * Nota geral a partir dos subcritérios, usando os pesos do scorecard do guia.
 * Útil quando a fonte entrega só as notas por bloco.
 * @param {Partial<Record<DimensionKey, number>>} dims
 */
export function overallFromDimensions(dims) {
  let sum = 0;
  let w = 0;
  for (const d of DIMENSIONS) {
    const v = dims[d.key];
    if (isNum(v)) { sum += v * d.weight; w += d.weight; }
  }
  return w ? sum / w : null;
}
