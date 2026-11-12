// @ts-check
/**
 * Provider HTTP para a integração real (AINDA NÃO LIGADO: ver DATA_CONFIG.source).
 *
 * Por que um proxy? O Hub é estático (GitHub Pages): qualquer token colocado
 * aqui fica público. O token da Salesbud precisa ficar num backend leve
 * (Cloudflare Worker, Google Apps Script, Cloud Function...) que:
 *   1. valida a sessão do Hub (ID token do Google @suri.ai);
 *   2. chama a API da Salesbud com o token guardado no servidor;
 *   3. devolve as calls (cruas, mapeadas aqui por salesbud-mapper.js).
 *
 * Rotas esperadas no proxy (ajuste aos endpoints reais da Salesbud):
 *   GET {base}/sellers?email=...           → SalesbudSeller | 404
 *   GET {base}/sellers                     → SalesbudSeller[]
 *   GET {base}/calls?seller_id=&from=&to=  → SalesbudCall[]   (from/to em ISO 8601)
 */
import { mapSalesbudCall, mapSalesbudSeller } from './salesbud-mapper.js';

/** @typedef {import('../lib/types.js').ScoresDataProvider} ScoresDataProvider */
/** @typedef {import('./salesbud-mapper.js').SalesbudCall} SalesbudCall */
/** @typedef {import('./salesbud-mapper.js').SalesbudSeller} SalesbudSeller */

export class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {Object} opts
 * @param {string} opts.baseUrl
 * @param {() => string | null} [opts.getAuthToken]   ID token da sessão do Hub (não o token da Salesbud).
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {ScoresDataProvider}
 */
export function createHttpProvider({ baseUrl, getAuthToken = () => null, fetchImpl = fetch }) {
  if (!baseUrl) throw new Error('DATA_CONFIG.httpBaseUrl não configurado');

  /** @template T @param {string} path @param {Record<string, string | undefined>} [params] @returns {Promise<T>} */
  async function get(path, params = {}) {
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
    const token = getAuthToken();
    const res = await fetchImpl(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new HttpError(res.status, `Falha ao buscar notas (${res.status})`);
    return /** @type {Promise<T>} */ (res.json());
  }

  return {
    name: 'http',
    async getCloserByEmail(email) {
      try {
        const raw = await get(/** @type {string} */ ('sellers'), { email });
        return raw ? mapSalesbudSeller(/** @type {SalesbudSeller} */ (raw)) : null;
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return null;
        throw e;
      }
    },
    async listClosers() {
      /** @type {SalesbudSeller[]} */
      const raw = await get('sellers');
      return raw.map(mapSalesbudSeller);
    },
    async listMeetings({ closerId, from, to }) {
      /** @type {SalesbudCall[]} */
      const raw = await get('calls', { seller_id: closerId, from: from.toISOString(), to: to.toISOString() });
      return raw.map(mapSalesbudCall);
    },
  };
}
