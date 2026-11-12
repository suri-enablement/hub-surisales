// @ts-check
/**
 * useCloserMetrics: o "hook" do painel, em JS puro (o Hub não usa framework).
 *
 * Guarda o estado (closer, granularidade, período), busca os dados no provider,
 * calcula o DashboardData e avisa os assinantes. Cuida de carregamento, erro,
 * período vazio, respostas fora de ordem e cache por intervalo.
 *
 * Uso:
 *   const metrics = createCloserMetrics({ provider });
 *   metrics.subscribe(render);
 *   await metrics.init('closer@suri.ai');
 */
import { getPeriod, shiftPeriod, isCurrentPeriod, requiredDataRange } from './periods.js';
import { buildDashboard, SPARKLINE_LENGTH } from './dashboard.js';
import { MANAGER_EMAILS, DATA_CONFIG } from './config.js';

/** @typedef {import('./types.js').Closer} Closer */
/** @typedef {import('./types.js').Granularity} Granularity */
/** @typedef {import('./types.js').Period} Period */
/** @typedef {import('./types.js').DashboardData} DashboardData */
/** @typedef {import('./types.js').ScoresDataProvider} ScoresDataProvider */
/** @typedef {import('./types.js').Meeting} Meeting */

/**
 * - loading: primeira carga (skeleton)
 * - refreshing: troca de filtro com dados anteriores na tela (mantém o quadro, opacidade reduzida)
 * - success: dados prontos e com reuniões avaliadas
 * - empty: dados prontos, mas nenhuma reunião avaliada no período
 * - error: falha ao buscar
 * @typedef {'loading' | 'refreshing' | 'success' | 'empty' | 'error'} MetricsStatus
 */

/**
 * @typedef {Object} MetricsState
 * @property {MetricsStatus} status
 * @property {Granularity} granularity
 * @property {Period} period
 * @property {boolean} isCurrent           O período exibido é o atual.
 * @property {boolean} canGoForward        Não deixa navegar para o futuro.
 * @property {Closer | null} closer
 * @property {Closer[]} closers            Preenchido para gestores.
 * @property {boolean} isManager
 * @property {DashboardData | null} data
 * @property {string | null} error
 */

/**
 * @param {Object} opts
 * @param {ScoresDataProvider} opts.provider
 * @param {Granularity} [opts.granularity]
 * @param {Date} [opts.anchor]        Data dentro do período inicial (padrão: hoje). Datas futuras viram hoje.
 * @param {() => Date} [opts.now]
 */
export function createCloserMetrics({ provider, granularity = 'month', anchor, now = () => new Date() }) {
  const today = now();
  const initialPeriod = getPeriod(granularity, anchor && anchor <= today ? anchor : today);
  /** @type {MetricsState} */
  let state = {
    status: 'loading',
    granularity,
    period: initialPeriod,
    isCurrent: isCurrentPeriod(initialPeriod, today),
    canGoForward: shiftPeriod(initialPeriod, 1).start <= today,
    closer: null,
    closers: [],
    isManager: false,
    data: null,
    error: null,
  };
  /** @type {Set<(s: MetricsState) => void>} */
  const listeners = new Set();
  /** @type {Map<string, Promise<Meeting[]>>} */
  const cache = new Map();
  let requestId = 0;

  /** @param {Partial<MetricsState>} patch */
  function set(patch) {
    state = { ...state, ...patch };
    const t = now();
    state.isCurrent = isCurrentPeriod(state.period, t);
    state.canGoForward = shiftPeriod(state.period, 1).start <= t;
    listeners.forEach((fn) => fn(state));
  }

  /** @param {string | undefined} closerId @param {Date} from @param {Date} to */
  function fetchMeetings(closerId, from, to) {
    const key = `${closerId ?? '*'}|${from.toISOString()}|${to.toISOString()}`;
    let p = cache.get(key);
    if (!p) {
      p = provider.listMeetings({ closerId, from, to });
      cache.set(key, p);
      p.catch(() => cache.delete(key)); // não guarda falhas
    }
    return p;
  }

  async function load() {
    const closer = state.closer;
    if (!closer) return;
    const id = ++requestId;
    set({ status: state.data ? 'refreshing' : 'loading', error: null });
    try {
      const range = requiredDataRange(state.period, SPARKLINE_LENGTH);
      const [meetings, teamMeetings] = await Promise.all([
        fetchMeetings(closer.id, range.start, range.end),
        fetchMeetings(undefined, state.period.start, state.period.end),
      ]);
      if (id !== requestId) return; // resposta antiga: ignora
      const data = buildDashboard({ closer, meetings, teamMeetings, period: state.period, now: now() });
      set({ status: data.kpis.evaluated === 0 ? 'empty' : 'success', data });
    } catch (err) {
      if (id !== requestId) return;
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    getState: () => state,

    /** @param {(s: MetricsState) => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      fn(state);
      return () => { listeners.delete(fn); };
    },

    /**
     * Resolve o closer logado (e a lista, para gestores) e faz a primeira carga.
     * @param {string} email
     * @param {{ closerId?: string }} [opts]
     */
    async init(email, opts = {}) {
      set({ status: 'loading', error: null });
      try {
        const isManager = MANAGER_EMAILS.includes(email.toLowerCase())
          || (DATA_CONFIG.source === 'mock' && DATA_CONFIG.demoManagerView);
        const [me, closers] = await Promise.all([
          provider.getCloserByEmail(email),
          isManager ? provider.listClosers() : Promise.resolve(/** @type {Closer[]} */ ([])),
        ]);
        const chosen = (opts.closerId && closers.find((c) => c.id === opts.closerId)) || me || closers[0] || null;
        if (!chosen) {
          set({ status: 'error', error: 'Não encontramos um closer vinculado ao seu e-mail.' });
          return;
        }
        set({ closer: chosen, closers, isManager });
        await load();
      } catch (err) {
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },

    /** @param {Granularity} g */
    setGranularity(g) {
      if (g === state.granularity) return Promise.resolve();
      // mantém a referência temporal: se estava olhando março, o trimestre vira Q1
      const t = now();
      const anchor = state.isCurrent ? t : state.period.start;
      set({ granularity: g, period: getPeriod(g, anchor > t ? t : anchor) });
      return load();
    },

    /** Navega n períodos (negativo = passado). @param {number} n */
    shift(n) {
      const next = shiftPeriod(state.period, n);
      if (next.start > now()) return Promise.resolve();
      set({ period: next });
      return load();
    },

    /** Volta para o período atual. */
    goToCurrent() {
      set({ period: getPeriod(state.granularity, now()) });
      return load();
    },

    /** Gestor: troca o closer exibido. @param {string} closerId */
    setCloser(closerId) {
      const c = state.closers.find((x) => x.id === closerId);
      if (!c || c.id === state.closer?.id) return Promise.resolve();
      set({ closer: c });
      return load();
    },

    /** Tenta de novo depois de um erro (limpa o cache). */
    retry() {
      cache.clear();
      return state.closer ? load() : Promise.resolve();
    },
  };
}
