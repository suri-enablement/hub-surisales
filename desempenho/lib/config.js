// @ts-check
/**
 * Configuração do Painel de Desempenho. Tudo que é regra de negócio ajustável
 * (pesos, meta, faixas, níveis, fonte de dados) mora aqui.
 */

/** @typedef {import('./types.js').DimensionKey} DimensionKey */
/** @typedef {import('./types.js').Level} Level */

/**
 * Composição da nota final = IA + Avaliação Humana.
 * Os pesos são normalizados, então { ai: 1, human: 1 } equivale a 50/50.
 */
export const SCORE_WEIGHTS = Object.freeze({ ai: 0.5, human: 0.5 });

/**
 * Quando só uma das avaliações existe:
 * - 'use-available': usa a nota disponível e marca como provisória (padrão);
 * - 'require-both': a reunião só conta como avaliada com as duas notas.
 * @type {'use-available' | 'require-both'}
 */
export const PARTIAL_SCORE_POLICY = 'use-available';

/** Nota mínima considerada "na meta". */
export const TARGET_SCORE = 8;

export const SCORE_MAX = 10;

/** Subcritérios do scorecard, na mesma ordem e com os mesmos pesos do guia do Closer. */
/** @type {ReadonlyArray<{ key: DimensionKey, label: string, short: string, weight: number, training?: { label: string, href: string } }>} */
export const DIMENSIONS = Object.freeze([
  { key: 'abertura', label: 'Abertura e postura', short: 'Abertura', weight: 15,
    training: { label: 'Revisar a abertura no guia', href: '../closer/index.html' } },
  { key: 'diagnostico', label: 'Diagnóstico', short: 'Diagnóstico', weight: 20,
    training: { label: 'Workshop de vendas (SPIN/SPICED)', href: '../treinamentos-rd/index.html' } },
  { key: 'apresentacao', label: 'Apresentação da solução', short: 'Apresentação', weight: 15,
    training: { label: 'Apresentação de proposta', href: '../treinamentos-rd/index.html' } },
  { key: 'negociacao', label: 'Negociação e objeções', short: 'Objeções', weight: 15,
    training: { label: 'Matriz de quebra de objeções', href: '../meta/quebra-objecoes.html' } },
  { key: 'fechamento', label: 'Fechamento e próximos passos', short: 'Fechamento', weight: 25,
    training: { label: 'Fechamento no guia do Closer', href: '../closer/index.html' } },
]);

/** Faixas da distribuição de notas (min inclusivo, max exclusivo; a última inclui o 10). */
export const SCORE_BANDS = Object.freeze([
  { key: 'low', label: 'Abaixo de 6', min: 0, max: 6 },
  { key: 'mid', label: '6 a 7,9', min: 6, max: 8 },
  { key: 'good', label: '8 a 8,9', min: 8, max: 9 },
  { key: 'top', label: '9 a 10', min: 9, max: 10 },
]);

/** Níveis de gamificação pela média do período. */
/** @type {ReadonlyArray<Level>} */
export const LEVELS = Object.freeze([
  { key: 'bronze', name: 'Bronze', min: 0, emoji: '🥉' },
  { key: 'prata', name: 'Prata', min: 7, emoji: '🥈' },
  { key: 'ouro', name: 'Ouro', min: 8, emoji: '🥇' },
  { key: 'diamante', name: 'Diamante', min: 9, emoji: '💎' },
]);

/**
 * E-mails com visão de gestor (podem escolher qualquer closer).
 * TODO(integração): trocar por papel/permissão vindo da API ou do SSO.
 */
export const MANAGER_EMAILS = Object.freeze([
  'gestor@suri.ai',
  'enablement@suri.ai',
]);

/**
 * Fonte de dados do painel.
 * - 'mock': dados fictícios determinísticos (demonstração);
 * - 'http': proxy próprio que conversa com a Salesbud (ver data/http-provider.js).
 * @type {{ source: 'mock' | 'http', httpBaseUrl: string, mockLatencyMs: number, demoManagerView: boolean }}
 */
export const DATA_CONFIG = Object.freeze({
  source: 'mock',
  /** TODO(integração): URL do proxy (Cloudflare Worker, Apps Script, backend próprio). */
  httpBaseUrl: '',
  /** Latência simulada para exibir os estados de carregamento. */
  mockLatencyMs: 550,
  /** No modo demo, qualquer pessoa vê o seletor de closer (como gestor). */
  demoManagerView: true,
});

/** Quantas reuniões aparecem na lista antes do "ver mais". */
export const RECENT_PAGE_SIZE = 8;
