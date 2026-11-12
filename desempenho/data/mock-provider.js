// @ts-check
/**
 * Provider de DEMONSTRAÇÃO: gera reuniões e notas fictícias, determinísticas
 * (mesma semente = mesmos dados), relativas à data de hoje para a demo
 * sempre parecer atual. Nenhum dado aqui é real.
 */
import { DIMENSIONS } from '../lib/config.js';
import { overallFromDimensions, clampScore, round1 } from '../lib/scoring.js';

/** @typedef {import('../lib/types.js').Closer} Closer */
/** @typedef {import('../lib/types.js').Meeting} Meeting */
/** @typedef {import('../lib/types.js').ScoreSet} ScoreSet */
/** @typedef {import('../lib/types.js').DimensionKey} DimensionKey */
/** @typedef {import('../lib/types.js').ScoresDataProvider} ScoresDataProvider */

/** PRNG pequeno e determinístico. @param {number} seed */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string} s */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Perfil de desempenho fictício de um closer.
 * @typedef {Object} Profile
 * @property {number} from          Nota-base no início do histórico.
 * @property {number} to            Nota-base hoje.
 * @property {number} noise
 * @property {number} aiBias        IA tende a dar + (ou −) que humanos.
 * @property {Partial<Record<DimensionKey, number>>} dims  Pontos fortes/fracos.
 * @property {number} [startMonthsAgo]  Quando começou a fazer reuniões.
 * @property {number} [dip]         Queda recente (últimas semanas).
 */

/** @type {Array<Closer & { profile: Profile }>} */
const CLOSERS = [
  { id: 'c-ana', name: 'Ana Beatriz Rocha', email: 'ana.rocha@suri.ai', team: 'Closers · Squad Aurora',
    profile: { from: 7.4, to: 8.8, noise: 0.7, aiBias: -0.2, dims: { diagnostico: 0.5, fechamento: 0.3, negociacao: -0.7 } } },
  { id: 'c-bruno', name: 'Bruno Carvalho', email: 'bruno.carvalho@suri.ai', team: 'Closers · Squad Aurora',
    profile: { from: 6.6, to: 8.1, noise: 0.9, aiBias: 0.3, dims: { apresentacao: 0.6, abertura: 0.3, diagnostico: -0.8 } } },
  { id: 'c-camila', name: 'Camila Nunes', email: 'camila.nunes@suri.ai', team: 'Closers · Squad Boreal',
    profile: { from: 8.7, to: 9.1, noise: 0.5, aiBias: 0.1, dims: { fechamento: 0.4, negociacao: 0.3, abertura: -0.4 } } },
  { id: 'c-diego', name: 'Diego Martins', email: 'diego.martins@suri.ai', team: 'Closers · Squad Boreal',
    profile: { from: 8.2, to: 7.9, noise: 0.8, aiBias: -0.5, dims: { abertura: 0.5, fechamento: -0.9 }, dip: 0.8 } },
  { id: 'c-eduarda', name: 'Eduarda Lima', email: 'eduarda.lima@suri.ai', team: 'Closers · Squad Aurora',
    profile: { from: 6.2, to: 7.8, noise: 0.9, aiBias: 0.2, dims: { abertura: 0.6, negociacao: -0.6 }, startMonthsAgo: 5 } },
];

/** Perfil usado para "você" quando o e-mail logado não é um dos closers fictícios. */
const ME_PROFILE = /** @type {Profile} */ ({ from: 7.1, to: 8.7, noise: 0.75, aiBias: -0.3, dims: { abertura: 0.4, apresentacao: 0.5, negociacao: -0.8 } });

const FIRST = ['Mariana', 'Rafael', 'Juliana', 'Gustavo', 'Patrícia', 'Thiago', 'Larissa', 'Rodrigo', 'Fernanda', 'Lucas',
  'Carolina', 'Henrique', 'Beatriz', 'Vinícius', 'Aline', 'Marcelo', 'Renata', 'Fábio', 'Gabriela', 'André'];
const LAST = ['Souza', 'Almeida', 'Ferreira', 'Ribeiro', 'Gomes', 'Barbosa', 'Moreira', 'Cardoso', 'Teixeira', 'Pereira',
  'Mendes', 'Castro', 'Pinto', 'Araújo', 'Correia'];
const COMPANIES = ['Casa Aurora Decor', 'Vila Verde Hortifruti', 'Bella Pele Cosméticos', 'Moda Raízes', 'PetMais Store',
  'Grão Nobre Cafés', 'Ponto Tech Eletrônicos', 'Doce Ateliê', 'Fit Nutri Suplementos', 'Lar & Cia Móveis',
  'Ótica Horizonte', 'Mundo Kids Brinquedos', 'Sabor da Serra Empórios', 'Studio Ritmo Academia', 'Brisa Calçados',
  'Clínica Sorriso Pleno', 'AutoCenter Rota 9', 'Floricultura Jardim Azul', 'Livraria Entrelinhas', 'Joias Lumière',
  'Farmácia Vida Leve', 'Imobiliária Porto Novo', 'Escola Saber+', 'Cervejaria Vale Alto', 'Pizzaria Forno Antigo',
  'Agro Campo Forte', 'Bike Trilha Shop', 'Atelier Linho & Algodão', 'Beleza Natural Spa', 'Construmax Materiais'];

/** Feedbacks curtos por subcritério (várias formulações para a demo não repetir). */
const FEEDBACK = /** @type {Record<DimensionKey, { good: string[], bad: string[] }>} */ ({
  abertura: {
    good: ['Abertura segura: alinhou tempo e agenda logo de cara.', 'Ótimo rapport inicial, lead engajou desde o primeiro minuto.', 'Estrutura da reunião combinada no início, conversa fluiu.'],
    bad: ['Faltou alinhar a agenda e o tempo da reunião no início.', 'Abertura longa demais antes de entrar no contexto do lead.', 'Não confirmou quem decide junto com o lead na abertura.'],
  },
  diagnostico: {
    good: ['Ótimo diagnóstico: perguntas de implicação bem exploradas.', 'Quantificou a dor do lead (volume de atendimentos e perda de vendas).', 'Boa escuta: resumiu a situação do lead antes de seguir.'],
    bad: ['Diagnóstico raso: aprofunde a dor antes de apresentar.', 'Faltou perguntar sobre o impacto financeiro do problema.', 'Pulou para a demo sem mapear o processo atual do lead.'],
  },
  apresentacao: {
    good: ['Apresentação conectada às dores levantadas, sem tour de features.', 'Demo objetiva, com casos do mesmo segmento do lead.', 'Explicou o ROI com os números do próprio lead.'],
    bad: ['Apresentação genérica: amarre cada recurso a uma dor do lead.', 'Demo longa: priorize os 2 ou 3 recursos que resolvem a dor.', 'Faltou checar entendimento durante a apresentação.'],
  },
  negociacao: {
    good: ['Contornou bem a objeção de preço com ROI.', 'Investigou a objeção antes de responder: lead se sentiu ouvido.', 'Usou bem a nova precificação da Meta para gerar urgência.'],
    bad: ['Objeção de preço respondida cedo demais: investigue antes de responder.', 'Concedeu desconto sem pedir contrapartida.', 'Deixou a objeção de "vou pensar" sem explorar o motivo real.'],
  },
  fechamento: {
    good: ['Fechou com próximo passo e data definidos.', 'Pediu o fechamento com naturalidade e conseguiu o aceite.', 'Recapitulou valor antes de propor o fechamento.'],
    bad: ['Saiu sem próximo passo concreto: proponha data e responsável.', 'Faltou pedir o fechamento de forma direta.', 'Não envolveu o decisor no próximo passo.'],
  },
});

/**
 * Gera todas as reuniões de um closer.
 * @param {string} closerId
 * @param {Profile} profile
 * @param {Date} now
 * @returns {Meeting[]}
 */
export function generateMeetings(closerId, profile, now) {
  const rand = mulberry32(hash(closerId));
  /** Normal aproximada (soma de uniformes). */
  const gauss = () => (rand() + rand() + rand() + rand() - 2) / 0.58;
  const pick = /** @template T @param {T[]} arr @returns {T} */ (arr) => arr[Math.floor(rand() * arr.length)];

  const historyStart = new Date(now.getFullYear() - 1, 0, 1); // ano passado inteiro + ano atual
  const start = profile.startMonthsAgo
    ? new Date(now.getFullYear(), now.getMonth() - profile.startMonthsAgo, 1)
    : historyStart;
  const span = now.getTime() - start.getTime();
  /** @type {Meeting[]} */
  const out = [];
  let seq = 0;

  for (let day = new Date(start); day <= now; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    const perDay = rand() < 0.18 ? 0 : 1 + Math.floor(rand() * 3);
    const hours = [9, 10, 11, 14, 15, 16, 17].sort(() => rand() - 0.5).slice(0, perDay).sort((a, b) => a - b);

    for (const h of hours) {
      const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, rand() < 0.5 ? 0 : 30);
      if (date > now) continue;
      seq++;
      const progress = span > 0 ? (date.getTime() - start.getTime()) / span : 1;
      const daysAgo = (now.getTime() - date.getTime()) / 86400000;
      const dip = profile.dip && daysAgo < 45 ? -profile.dip * (1 - daysAgo / 45) : 0;
      const seasonal = Math.sin(progress * Math.PI * 5) * 0.18;
      const base = profile.from + (profile.to - profile.from) * Math.sqrt(progress) + seasonal + dip + gauss() * profile.noise * 0.6;

      const statusRoll = rand();
      const status = statusRoll < 0.07 ? 'no_show' : statusRoll < 0.1 ? 'cancelada' : 'realizada';
      const lead = `${pick(FIRST)} ${pick(LAST)}`;
      const company = pick(COMPANIES);

      /** @type {Meeting} */
      const meeting = {
        id: `${closerId}-${seq}`,
        closerId,
        date: date.toISOString(),
        status,
        leadName: lead,
        company,
        durationMin: status === 'realizada' ? 25 + Math.floor(rand() * 35) : 0,
        recordingUrl: status === 'realizada' ? '#gravacao' : undefined,
        evaluation: null,
      };

      if (status === 'realizada') {
        /** @type {Record<DimensionKey, number>} */
        const truth = /** @type {any} */ ({});
        for (const d of DIMENSIONS) truth[d.key] = clampScore(base + (profile.dims[d.key] ?? 0) + gauss() * profile.noise * 0.5);

        /** @param {number} bias @param {number} spread @param {string} evaluator @param {number} lagH @returns {ScoreSet} */
        const makeSet = (bias, spread, evaluator, lagH) => {
          /** @type {Record<DimensionKey, number>} */
          const dims = /** @type {any} */ ({});
          for (const d of DIMENSIONS) dims[d.key] = round1(clampScore(truth[d.key] + bias + gauss() * spread));
          return {
            overall: round1(clampScore(/** @type {number} */ (overallFromDimensions(dims)))),
            dimensions: dims,
            evaluatedAt: new Date(date.getTime() + lagH * 3600000).toISOString(),
            evaluator,
          };
        };

        // ~7% das gravações falham (sem IA); a IA processa em ~2h; humanos avaliam em 1–7 dias
        const recordingFailed = rand() < 0.07;
        const hasAi = !recordingFailed && daysAgo > 0.08;
        const humanLagDays = 1 + rand() * 6;
        const hasHuman = daysAgo > humanLagDays && rand() < (recordingFailed ? 0.3 : 0.85);
        const ai = hasAi ? makeSet(profile.aiBias, 0.35, 'Suri IA · Scorecard', 0.5) : null;
        const human = hasHuman ? makeSet(0, 0.4, pick(['Paula (Enablement)', 'Ricardo (Gestor)', 'Tatiane (Enablement)']), humanLagDays * 24) : null;

        if (ai || human) {
          const ranked = DIMENSIONS.map((d) => ({ k: d.key, v: truth[d.key] })).sort((a, b) => b.v - a.v);
          const strong = ranked[0].k;
          const weak = ranked[ranked.length - 1].k;
          meeting.evaluation = {
            ai,
            human,
            feedback: `${pick(FEEDBACK[strong].good)} ${pick(FEEDBACK[weak].bad)}`,
            highlights: [pick(FEEDBACK[strong].good), pick(FEEDBACK[ranked[1].k].good)],
            improvements: [pick(FEEDBACK[weak].bad), pick(FEEDBACK[ranked[ranked.length - 2].k].bad)],
          };
        }
      }
      out.push(meeting);
    }
  }
  return out;
}

/** "seu.email@suri.ai" → "Seu Email" @param {string} email */
function nameFromEmail(email) {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || 'Você';
}

/**
 * @param {Object} [opts]
 * @param {() => Date} [opts.now]
 * @param {number} [opts.latencyMs]
 * @param {'normal' | 'vazio' | 'erro'} [opts.scenario]  Cenários para demonstrar estados da UI.
 * @param {string} [opts.currentEmail]                   E-mail logado (vira "você" na lista).
 * @returns {ScoresDataProvider}
 */
export function createMockProvider(opts = {}) {
  const now = opts.now ?? (() => new Date());
  const latency = opts.latencyMs ?? 0;
  const scenario = opts.scenario ?? 'normal';
  const email = (opts.currentEmail ?? '').toLowerCase();
  const known = CLOSERS.find((c) => c.email === email);

  /** @type {Array<Closer & { profile: Profile }>} */
  const roster = known || !email
    ? CLOSERS
    : [{ id: 'c-voce', name: nameFromEmail(email), email, team: 'Closers · Squad Aurora', profile: ME_PROFILE }, ...CLOSERS];

  /** @type {Map<string, Meeting[]>} */
  const generated = new Map();
  /** @param {Closer & { profile: Profile }} c */
  const meetingsOf = (c) => {
    let list = generated.get(c.id);
    if (!list) { list = generateMeetings(c.id, c.profile, now()); generated.set(c.id, list); }
    return list;
  };

  /** @template T @param {() => T} fn @returns {Promise<T>} */
  const delay = (fn) => new Promise((resolve, reject) => {
    setTimeout(() => {
      try { resolve(fn()); } catch (e) { reject(e); }
    }, latency);
  });

  /** @param {Closer & { profile: Profile }} c @returns {Closer} */
  const publicCloser = ({ profile, ...c }) => c;

  return {
    name: 'mock',
    getCloserByEmail: (e) => delay(() => {
      const c = roster.find((x) => x.email === e.toLowerCase());
      return c ? publicCloser(c) : null;
    }),
    listClosers: () => delay(() => roster.map(publicCloser)),
    listMeetings: ({ closerId, from, to }) => delay(() => {
      if (scenario === 'erro') throw new Error('Não foi possível conectar à fonte de notas (simulação).');
      if (scenario === 'vazio') return [];
      const who = closerId ? roster.filter((c) => c.id === closerId) : roster;
      return who.flatMap(meetingsOf).filter((m) => {
        const d = new Date(m.date);
        return d >= from && d < to;
      });
    }),
  };
}
