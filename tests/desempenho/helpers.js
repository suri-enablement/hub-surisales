// @ts-check
/** Fábricas de dados de teste. */

/** @typedef {import('../../desempenho/lib/types.js').Meeting} Meeting */
/** @typedef {import('../../desempenho/lib/types.js').DimensionScores} DimensionScores */

/** @param {number} v @returns {DimensionScores} */
export const dims = (v) => ({ abertura: v, diagnostico: v, apresentacao: v, negociacao: v, fechamento: v });

let seq = 0;
/**
 * @param {Partial<Meeting> & { ai?: number | null, human?: number | null, dimsAi?: Partial<DimensionScores>, dimsHuman?: Partial<DimensionScores> }} o
 * @returns {Meeting}
 */
export function meeting(o) {
  const { ai = null, human = null, dimsAi, dimsHuman, ...rest } = o;
  const date = rest.date ?? '2026-11-10T14:00:00';
  return {
    id: `m${++seq}`,
    closerId: 'c1',
    date,
    status: 'realizada',
    leadName: 'Lead',
    company: 'Empresa',
    durationMin: 30,
    evaluation: ai === null && human === null ? null : {
      ai: ai === null ? null : { overall: ai, dimensions: dimsAi ?? dims(ai), evaluatedAt: date },
      human: human === null ? null : { overall: human, dimensions: dimsHuman ?? dims(human), evaluatedAt: date },
      feedback: 'ok',
    },
    ...rest,
  };
}
