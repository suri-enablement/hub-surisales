// @ts-check
/**
 * Mapeamento Salesbud → modelo do painel (lib/types.js).
 *
 * ⚠️ PONTO DE INTEGRAÇÃO: os nomes de campo abaixo (SalesbudCall etc.) são uma
 * SUPOSIÇÃO e precisam ser confirmados em https://docs.salesbud.com.br/ antes de
 * ligar a integração. Ajuste só este arquivo: o restante do painel consome
 * apenas `Meeting` / `Closer`.
 *
 * Funções puras, cobertas por tests/desempenho/salesbud-mapper.test.js.
 */
import { DIMENSIONS } from '../lib/config.js';
import { overallFromDimensions } from '../lib/scoring.js';

/** @typedef {import('../lib/types.js').Meeting} Meeting */
/** @typedef {import('../lib/types.js').Closer} Closer */
/** @typedef {import('../lib/types.js').ScoreSet} ScoreSet */
/** @typedef {import('../lib/types.js').DimensionKey} DimensionKey */
/** @typedef {import('../lib/types.js').MeetingStatus} MeetingStatus */

/**
 * Formato ESPERADO de uma call da Salesbud (a confirmar na documentação).
 * @typedef {Object} SalesbudCall
 * @property {string | number} id
 * @property {string | number} seller_id
 * @property {string} started_at
 * @property {number} [duration_seconds]
 * @property {string} [status]                 Ex.: 'completed', 'no_show', 'canceled'.
 * @property {string} [contact_name]
 * @property {string} [company_name]
 * @property {string} [recording_url]
 * @property {SalesbudScore | null} [ai_evaluation]
 * @property {SalesbudScore | null} [manual_evaluation]
 * @property {string} [summary]
 */

/**
 * @typedef {Object} SalesbudScore
 * @property {number} [score]                  Nota geral (escala a confirmar: 0–10 ou 0–100).
 * @property {Array<{ name: string, score: number }>} [criteria]
 * @property {string} [evaluated_at]
 * @property {string} [evaluator_name]
 * @property {string} [comment]
 * @property {string[]} [strengths]
 * @property {string[]} [improvements]
 */

/**
 * @typedef {Object} SalesbudSeller
 * @property {string | number} id
 * @property {string} name
 * @property {string} email
 * @property {string} [team_name]
 */

/**
 * Nome do critério na Salesbud → subcritério do painel.
 * TODO(integração): preencher com os nomes reais do scorecard configurado na Salesbud.
 * @type {Record<string, DimensionKey>}
 */
export const CRITERIA_MAP = {
  'abertura': 'abertura',
  'abertura e postura': 'abertura',
  'rapport': 'abertura',
  'diagnóstico': 'diagnostico',
  'diagnostico': 'diagnostico',
  'descoberta': 'diagnostico',
  'apresentação': 'apresentacao',
  'apresentacao': 'apresentacao',
  'apresentação da solução': 'apresentacao',
  'negociação': 'negociacao',
  'negociacao': 'negociacao',
  'objeções': 'negociacao',
  'contorno de objeções': 'negociacao',
  'fechamento': 'fechamento',
  'próximos passos': 'fechamento',
};

/**
 * Escala de origem da nota. Se a Salesbud entregar 0–100, troque para 100.
 * TODO(integração): confirmar.
 */
export const SOURCE_SCALE = 10;

/** @param {number} v */
const toTen = (v) => (SOURCE_SCALE === 10 ? v : (v / SOURCE_SCALE) * 10);

/** @param {string | undefined} s @returns {MeetingStatus} */
export function mapStatus(s) {
  const v = (s ?? '').toLowerCase();
  if (['no_show', 'noshow', 'no-show', 'ausente'].includes(v)) return 'no_show';
  if (['canceled', 'cancelled', 'cancelada'].includes(v)) return 'cancelada';
  return 'realizada';
}

/**
 * @param {SalesbudScore | null | undefined} raw
 * @param {string} fallbackDate
 * @returns {ScoreSet | null}
 */
export function mapScore(raw, fallbackDate) {
  if (!raw) return null;
  /** @type {Partial<Record<DimensionKey, number>>} */
  const dimensions = {};
  for (const c of raw.criteria ?? []) {
    const key = CRITERIA_MAP[c.name.trim().toLowerCase()];
    if (key && typeof c.score === 'number') dimensions[key] = toTen(c.score);
  }
  const overall = typeof raw.score === 'number' ? toTen(raw.score) : overallFromDimensions(dimensions);
  if (overall === null) return null;
  return {
    overall,
    dimensions,
    evaluatedAt: raw.evaluated_at ?? fallbackDate,
    evaluator: raw.evaluator_name,
  };
}

/** @param {SalesbudCall} raw @returns {Meeting} */
export function mapSalesbudCall(raw) {
  const ai = mapScore(raw.ai_evaluation, raw.started_at);
  const human = mapScore(raw.manual_evaluation, raw.started_at);
  const strengths = [...(raw.manual_evaluation?.strengths ?? []), ...(raw.ai_evaluation?.strengths ?? [])];
  const improvements = [...(raw.manual_evaluation?.improvements ?? []), ...(raw.ai_evaluation?.improvements ?? [])];
  return {
    id: String(raw.id),
    closerId: String(raw.seller_id),
    date: raw.started_at,
    status: mapStatus(raw.status),
    leadName: raw.contact_name ?? 'Lead sem nome',
    company: raw.company_name ?? '—',
    durationMin: Math.round((raw.duration_seconds ?? 0) / 60),
    recordingUrl: raw.recording_url,
    evaluation: ai || human ? {
      ai,
      human,
      feedback: raw.manual_evaluation?.comment ?? raw.summary ?? raw.ai_evaluation?.comment,
      highlights: strengths,
      improvements,
    } : null,
  };
}

/** @param {SalesbudSeller} raw @returns {Closer} */
export function mapSalesbudSeller(raw) {
  return { id: String(raw.id), name: raw.name, email: raw.email.toLowerCase(), team: raw.team_name ?? 'Closers' };
}

/** Garante que todo subcritério conhecido existe no mapa (ajuda a detectar lacunas). */
export function unmappedDimensions() {
  const mapped = new Set(Object.values(CRITERIA_MAP));
  return DIMENSIONS.filter((d) => !mapped.has(d.key)).map((d) => d.key);
}
