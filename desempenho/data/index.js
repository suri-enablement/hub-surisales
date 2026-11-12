// @ts-check
/** Escolhe o provider de dados conforme DATA_CONFIG (mock agora; http na integração). */
import { DATA_CONFIG } from '../lib/config.js';
import { createMockProvider } from './mock-provider.js';
import { createHttpProvider } from './http-provider.js';

/** @typedef {import('../lib/types.js').ScoresDataProvider} ScoresDataProvider */

/**
 * @param {Object} opts
 * @param {string} opts.email                         E-mail da sessão do Hub.
 * @param {'normal' | 'vazio' | 'erro'} [opts.scenario] Só no mock (?demo=vazio | ?demo=erro).
 * @returns {ScoresDataProvider}
 */
export function createProvider({ email, scenario = 'normal' }) {
  if (DATA_CONFIG.source === 'http') {
    return createHttpProvider({
      baseUrl: DATA_CONFIG.httpBaseUrl,
      // TODO(integração): expor o ID token do Google guardado pelo assets/hub.js.
      getAuthToken: () => null,
    });
  }
  return createMockProvider({ latencyMs: DATA_CONFIG.mockLatencyMs, scenario, currentEmail: email });
}
