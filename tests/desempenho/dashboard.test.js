// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard } from '../../desempenho/lib/dashboard.js';
import { buildInsights } from '../../desempenho/lib/insights.js';
import { getPeriod } from '../../desempenho/lib/periods.js';
import { createMockProvider } from '../../desempenho/data/mock-provider.js';
import { createCloserMetrics } from '../../desempenho/lib/use-closer-metrics.js';

const NOW = new Date('2026-11-12T18:00:00');
const now = () => NOW;

test('mock é determinístico e respeita o intervalo pedido', async () => {
  const a = createMockProvider({ now });
  const b = createMockProvider({ now });
  const q = { closerId: 'c-ana', from: new Date('2026-01-01T00:00:00'), to: new Date('2026-02-01T00:00:00') };
  const [ma, mb] = await Promise.all([a.listMeetings(q), b.listMeetings(q)]);
  assert.ok(ma.length > 20);
  assert.deepEqual(ma, mb);
  assert.ok(ma.every((m) => new Date(m.date) >= q.from && new Date(m.date) < q.to));
});

test('mock inclui o usuário logado como closer', async () => {
  const p = createMockProvider({ now, currentEmail: 'joao.silva@suri.ai' });
  const me = await p.getCloserByEmail('joao.silva@suri.ai');
  assert.equal(me?.name, 'Joao Silva');
  assert.equal((await p.listClosers())[0].id, me?.id);
});

test('dashboard completo a partir do mock', async () => {
  const p = createMockProvider({ now });
  const closer = /** @type {import('../../desempenho/lib/types.js').Closer} */ (await p.getCloserByEmail('ana.rocha@suri.ai'));
  const period = getPeriod('year', NOW);
  const meetings = await p.listMeetings({ closerId: closer.id, from: new Date(2025, 0, 1), to: new Date(2027, 0, 1) });
  const team = await p.listMeetings({ from: period.start, to: period.end });
  const d = buildDashboard({ closer, meetings, teamMeetings: team, period, now: NOW });
  assert.equal(d.trend.length, 12);
  assert.equal(d.trend[11].future, true);
  assert.ok(d.kpis.average !== null && d.kpis.average > 7 && d.kpis.average <= 10);
  assert.ok(d.kpis.evaluated <= d.kpis.held);
  assert.equal(d.dimensions.length, 5);
  assert.equal(d.quarters.length, 4);
  assert.ok(d.insights.length > 0 && d.insights.length <= 4);
  assert.equal(d.sparkline.length, 8);
  assert.ok(d.recent.every((m, i, arr) => i === 0 || arr[i - 1].date >= m.date));
});

test('insights vazios quando não há notas', () => {
  const insights = buildInsights({
    period: getPeriod('month', NOW),
    kpis: { average: null, previousAverage: null, delta: null, deltaPct: null, aiAverage: null, humanAverage: null, held: 2, evaluated: 0, pendingHuman: 0, noShows: 0, coverage: 0, onTarget: 0, targetRate: null, previousTargetRate: null },
    dimensions: [], trend: [], slope: null, streak: 0, meetings: [], teamAverage: null,
  });
  assert.deepEqual(insights, []);
});

test('hook: carrega, navega, não vai para o futuro e trata vazio/erro', async () => {
  const m = createCloserMetrics({ provider: createMockProvider({ now }), granularity: 'month', now });
  /** @type {string[]} */
  const statuses = [];
  m.subscribe((s) => statuses.push(s.status));
  await m.init('ana.rocha@suri.ai');
  assert.equal(m.getState().status, 'success');
  assert.equal(m.getState().closer?.id, 'c-ana');
  assert.equal(m.getState().canGoForward, false);
  assert.ok(statuses.includes('loading'));

  await m.shift(1); // futuro: ignora
  assert.equal(m.getState().period.label, 'Novembro 2026');
  await m.shift(-1);
  assert.equal(m.getState().period.label, 'Outubro 2026');
  assert.ok(statuses.includes('refreshing'));
  await m.setGranularity('quarter');
  assert.equal(m.getState().period.shortLabel, 'Q4');
  await m.setCloser('c-eduarda');
  await m.setGranularity('year');
  await m.shift(-1); // Eduarda começou há 5 meses: 2025 vazio
  assert.equal(m.getState().status, 'empty');

  const err = createCloserMetrics({ provider: createMockProvider({ now, scenario: 'erro' }), now });
  await err.init('ana.rocha@suri.ai');
  assert.equal(err.getState().status, 'error');
  assert.match(err.getState().error ?? '', /simulação/);
});

test('hook: resposta antiga não sobrescreve a mais nova', async () => {
  const base = createMockProvider({ now });
  let calls = 0;
  /** @type {import('../../desempenho/lib/types.js').ScoresDataProvider} */
  const slowFirst = {
    ...base,
    listMeetings: async (q) => {
      const n = ++calls;
      const r = await base.listMeetings(q);
      if (n <= 2) await new Promise((res) => setTimeout(res, 30)); // primeira carga lenta
      return r;
    },
  };
  const m = createCloserMetrics({ provider: slowFirst, granularity: 'month', now });
  const first = m.init('ana.rocha@suri.ai');
  await new Promise((res) => setTimeout(res, 5));
  await m.setGranularity('year');
  await first;
  assert.equal(m.getState().data?.period.granularity, 'year');
});
