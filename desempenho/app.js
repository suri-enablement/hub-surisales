// @ts-check
/**
 * Painel de Desempenho do Closer · camada de UI.
 * Só desenha: estado e cálculos vêm de lib/use-closer-metrics.js.
 *
 * Parâmetros de URL (deep link / demo):
 *   ?g=week|month|quarter|year   granularidade
 *   &d=2026-08-01                data dentro do período
 *   &closer=c-ana                closer (visão gestor)
 *   &demo=vazio|erro             simula os estados vazio e de erro
 */
import { createCloserMetrics } from './lib/use-closer-metrics.js';
import { createProvider } from './data/index.js';
import { TARGET_SCORE, SCORE_WEIGHTS, DIMENSIONS, RECENT_PAGE_SIZE } from './lib/config.js';
import { GRANULARITY_LABELS } from './lib/periods.js';
import { fmtScore, fmtDelta, fmtDeltaPct, fmtPct, fmtPp, fmtDateTimeShort, plural } from './lib/format.js';
import { computeDimensionScore } from './lib/scoring.js';
import { h, renderTrendChart, renderSparkline, renderRing, bindTip, hideTip } from './lib/charts.js';

/** @typedef {import('./lib/types.js').Granularity} Granularity */
/** @typedef {import('./lib/types.js').DashboardData} DashboardData */
/** @typedef {import('./lib/types.js').ScoredMeeting} ScoredMeeting */
/** @typedef {import('./lib/use-closer-metrics.js').MetricsState} MetricsState */
/** @typedef {import('./lib/charts.js').TrendSeries} TrendSeries */

/* ------------------------------------------------------------------ setup */

/** @type {{ email: () => string }} */
const Hub = /** @type {any} */ (window).Hub;

const COLORS = { final: '#4A54FF', ai: '#D0661A', human: '#17968F', bands: ['#9EA6FF', '#6C75FF', '#3540E0', '#000F9B'] };
/** @type {TrendSeries[]} */
const SERIES = [
  { key: 'final', label: 'Nota final', color: COLORS.final, area: true, primary: true },
  { key: 'ai', label: 'IA', color: COLORS.ai },
  { key: 'human', label: 'Humana', color: COLORS.human },
];

const params = new URLSearchParams(location.search);
/** @type {Granularity[]} */
const GRANULARITIES = ['week', 'month', 'quarter', 'year'];
const gParam = /** @type {Granularity} */ (params.get('g'));
const dParam = params.get('d');
const demo = params.get('demo');
const anchor = dParam && /^\d{4}-\d{2}-\d{2}$/.test(dParam)
  ? new Date(Number(dParam.slice(0, 4)), Number(dParam.slice(5, 7)) - 1, Number(dParam.slice(8, 10)))
  : undefined;

const email = (Hub?.email() || 'seu.email@suri.ai').toLowerCase();
const provider = createProvider({ email, scenario: demo === 'vazio' || demo === 'erro' ? demo : 'normal' });
const metrics = createCloserMetrics({
  provider,
  granularity: GRANULARITIES.includes(gParam) ? gParam : 'month',
  anchor,
});

/** Estado só de UI (não afeta os cálculos). */
const ui = {
  /** @type {Record<'final' | 'ai' | 'human', boolean>} */
  visible: { final: true, ai: true, human: true },
  /** @type {'all' | 'below' | 'pending'} */
  listFilter: 'all',
  listLimit: RECENT_PAGE_SIZE,
  /** @type {DashboardData | null} */
  lastData: null,
};

/** @template {HTMLElement} T @param {string} id @returns {T} */
const $ = (id) => /** @type {T} */ (document.getElementById(id));

/* --------------------------------------------------------------- helpers */

/** @param {number | null} delta @param {number} [eps] */
const dirClass = (delta, eps = 0.05) => (delta === null || Math.abs(delta) < eps ? 'flat' : delta > 0 ? 'up' : 'down');
/** @param {number | null} delta */
const arrow = (delta) => (delta === null || Math.abs(delta) < 0.05 ? '→' : delta > 0 ? '↑' : '↓');

/** @param {number | null | undefined} v */
function scoreClass(v) {
  if (v === null || v === undefined) return 'none';
  if (v >= TARGET_SCORE) return 'ok';
  if (v >= TARGET_SCORE - 1) return 'near';
  return 'low';
}
const SCORE_STATUS = { ok: ['✓', 'Na meta'], near: ['•', 'Perto da meta'], low: ['!', 'Abaixo da meta'], none: ['', 'Sem nota'] };

/** @param {ScoredMeeting} m */
function scoreBadge(m) {
  const s = m.score;
  const cls = scoreClass(s?.value);
  const el = h('span', `score-badge ${cls}`);
  if (!s) {
    el.textContent = m.status === 'realizada' ? 'Em avaliação' : m.status === 'no_show' ? 'No-show' : 'Cancelada';
    return el;
  }
  const [icon, label] = SCORE_STATUS[cls];
  el.append(h('span', '', icon), document.createTextNode(fmtScore(s.value)));
  if (s.provisional) el.appendChild(h('span', 'prov', 'prov.'));
  el.title = `${label}${s.provisional ? ' · nota provisória (falta a avaliação ' + (s.ai === null ? 'da IA' : 'humana') + ')' : ''}`;
  el.appendChild(h('span', 'sr-only', ` ${label}`));
  return el;
}

/* ------------------------------------------------------------- controles */

$('granularityTabs').addEventListener('click', (e) => {
  const btn = /** @type {HTMLElement} */ (e.target).closest('[data-g]');
  if (btn) metrics.setGranularity(/** @type {Granularity} */ (btn.getAttribute('data-g')));
});
$('prevBtn').addEventListener('click', () => metrics.shift(-1));
$('nextBtn').addEventListener('click', () => metrics.shift(1));
$('currentBtn').addEventListener('click', () => metrics.goToCurrent());
$('closerSelect').addEventListener('change', (e) => metrics.setCloser(/** @type {HTMLSelectElement} */ (e.target).value));
document.addEventListener('keydown', (e) => {
  const tag = /** @type {HTMLElement} */ (e.target).tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || /** @type {HTMLElement} */ (e.target).closest('.trend-box')) return;
  if ($('meetingModal').hasAttribute('open')) return;
  if (e.key === '[' ) metrics.shift(-1);
  if (e.key === ']') metrics.shift(1);
});
$('listFilters').addEventListener('click', (e) => {
  const btn = /** @type {HTMLElement} */ (e.target).closest('[data-f]');
  if (!btn) return;
  ui.listFilter = /** @type {'all' | 'below' | 'pending'} */ (btn.getAttribute('data-f'));
  ui.listLimit = RECENT_PAGE_SIZE;
  document.querySelectorAll('#listFilters .chip').forEach((c) => c.classList.toggle('active', c === btn));
  if (ui.lastData) renderMeetings(ui.lastData);
});
$('moreBtn').addEventListener('click', () => {
  ui.listLimit += RECENT_PAGE_SIZE;
  if (ui.lastData) renderMeetings(ui.lastData);
});

// borda da barra de filtros quando gruda no topo
const filters = $('filters');
new IntersectionObserver(([e]) => filters.classList.toggle('stuck', e.intersectionRatio < 1), { rootMargin: '-77px 0px 0px 0px', threshold: [1] }).observe(filters);

// redesenha o gráfico ao redimensionar
let resizeRaf = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { if (ui.lastData) renderTrend(ui.lastData); });
}).observe($('trendChart'));

/* ---------------------------------------------------------------- render */

/** @param {MetricsState} s */
function render(s) {
  const g = GRANULARITY_LABELS[s.granularity];
  document.querySelectorAll('#granularityTabs .segtab').forEach((b) => {
    const on = b.getAttribute('data-g') === s.granularity;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('periodLabel').textContent = s.period.label;
  /** @type {HTMLButtonElement} */ ($('nextBtn')).disabled = !s.canGoForward;
  $('currentBtn').hidden = s.isCurrent;
  $('currentBtn').textContent = `Ir para ${g.article === 'a' ? 'esta' : 'este'} ${g.unit}`;
  $('demoPill').hidden = provider.name !== 'mock';

  // seletor de closer (gestor)
  const field = $('closerField');
  field.hidden = !s.isManager || s.closers.length < 2;
  const sel = /** @type {HTMLSelectElement} */ ($('closerSelect'));
  if (sel.options.length !== s.closers.length) {
    sel.replaceChildren(...s.closers.map((c) => {
      const o = h('option', '', c.email === email ? `${c.name} (você)` : c.name);
      o.value = c.id;
      return o;
    }));
  }
  if (s.closer) sel.value = s.closer.id;

  // saudação
  if (s.closer) {
    const isMe = s.closer.email === email;
    $('greeting').textContent = isMe ? `Olá, ${s.closer.name.split(' ')[0]}! 👋` : `Desempenho de ${s.closer.name}`;
    $('heroLede').textContent = isMe
      ? 'Acompanhe a evolução das notas das suas reuniões de fechamento: IA + avaliação humana, por semana, mês, trimestre e ano.'
      : `${s.closer.team} · visão de gestor. Notas de IA + avaliação humana das reuniões de fechamento.`;
  }

  syncUrl(s);

  const dash = $('dash');
  const stateRoot = $('stateRoot');
  dash.classList.toggle('is-refreshing', s.status === 'refreshing');

  if (s.status === 'loading') {
    hideTip();
    dash.hidden = true;
    stateRoot.replaceChildren(skeleton());
    return;
  }
  if (s.status === 'error') {
    dash.hidden = true;
    stateRoot.replaceChildren(errorState(s.error));
    return;
  }
  if (s.status === 'empty' && s.data) {
    dash.hidden = true;
    ui.lastData = null;
    stateRoot.replaceChildren(emptyState(s));
    return;
  }
  if (s.status === 'success' && s.data && s.data !== ui.lastData) {
    stateRoot.replaceChildren();
    dash.hidden = false;
    ui.lastData = s.data;
    ui.listLimit = RECENT_PAGE_SIZE;
    renderDashboard(s.data);
  }
}

/** @param {MetricsState} s */
function syncUrl(s) {
  const p = new URLSearchParams(location.search);
  p.set('g', s.granularity);
  const d = s.period.start;
  if (s.isCurrent) p.delete('d');
  else p.set('d', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  if (s.closer && s.closer.email !== email) p.set('closer', s.closer.id);
  else p.delete('closer');
  const next = `${location.pathname}?${p.toString()}`;
  if (next !== `${location.pathname}${location.search}`) history.replaceState(null, '', next);
}

/** @param {DashboardData} d */
function renderDashboard(d) {
  renderHero(d);
  renderTiles(d);
  renderSeriesToggle(d);
  renderTrend(d);
  renderTrendTable(d);
  renderTrendSummary(d);
  renderInsights(d);
  renderQuarters(d);
  renderDistribution(d);
  renderDimensions(d);
  renderMeetings(d);
}

/** @param {DashboardData} d */
function renderHero(d) {
  const { kpis, period, level } = d;
  const g = GRANULARITY_LABELS[period.granularity];
  $('heroPeriod').textContent = period.label;
  $('heroValue').textContent = fmtScore(kpis.average);
  const delta = $('heroDelta');
  delta.className = `hero-delta ${dirClass(kpis.delta)}`;
  delta.textContent = kpis.delta === null ? `sem base n${g.article} ${g.previous}` : `${arrow(kpis.delta)} ${fmtDelta(kpis.delta)} vs. ${g.previous}`;
  $('heroMeta').textContent = `${plural(kpis.evaluated, 'reunião avaliada', 'reuniões avaliadas')}${d.teamAverage !== null ? ` · média do time ${fmtScore(d.teamAverage)}` : ''}`;

  const scored = d.recent.filter((m) => m.score !== null);
  const best = scored.reduce((a, b) => (a && (a.score?.value ?? 0) >= (b.score?.value ?? 0) ? a : b), /** @type {ScoredMeeting | null} */ (null));
  const worst = scored.reduce((a, b) => (a && (a.score?.value ?? 0) <= (b.score?.value ?? 0) ? a : b), /** @type {ScoredMeeting | null} */ (null));
  /** @param {string} t @param {string} n @param {string} sub */
  const stat = (t, n, sub) => {
    const el = h('div', 'hs');
    el.append(h('div', 't', t), h('div', 'n', n), h('div', 's', sub));
    el.title = `${t}: ${n} · ${sub}`;
    return el;
  };
  $('heroStats').replaceChildren(
    stat('Melhor nota', fmtScore(best?.score?.value), best?.company ?? '—'),
    stat('Menor nota', fmtScore(worst?.score?.value), worst?.company ?? '—'),
    stat('Sequência', d.streak ? `${d.streak} 🔥` : '0', 'reuniões na meta'),
  );

  if (level) {
    $('heroLevelEmoji').textContent = level.current.emoji;
    $('levelName').textContent = `Nível ${level.current.name}`;
    $('levelNext').textContent = level.next
      ? `faltam ${fmtScore(Math.max(0.1, level.missing ?? 0))} pts para ${level.next.name} ${level.next.emoji}`
      : 'nível máximo! 🎉';
    requestAnimationFrame(() => { $('levelFill').style.width = `${Math.round(level.progress * 100)}%`; });
  }
  renderSparkline($('sparkline'), d.sparkline, {
    muted: 'rgba(255,255,255,.55)', accent: '#FFFFFF',
    label: `Média dos últimos ${d.sparkline.length} períodos`,
  });
  const unitPlural = { week: 'semanas', month: 'meses', quarter: 'trimestres', year: 'anos' }[period.granularity];
  $('sparkLabel').textContent = `últimos ${d.sparkline.length} ${unitPlural}`;
}

/** @param {DashboardData} d */
function renderTiles(d) {
  const { kpis, period } = d;
  const g = GRANULARITY_LABELS[period.granularity];

  // Variação
  $('deltaValue').textContent = kpis.delta === null ? '–' : `${fmtDelta(kpis.delta)} pts`;
  const pct = $('deltaPct');
  pct.className = `delta-chip ${dirClass(kpis.delta)}`;
  pct.textContent = kpis.deltaPct === null ? 'sem base' : `${arrow(kpis.delta)} ${fmtDeltaPct(kpis.deltaPct)}`;
  $('deltaFoot').replaceChildren(
    document.createTextNode(`vs. ${g.previous} (${d.previousPeriod.label}): `),
    h('b', '', fmtScore(kpis.previousAverage)),
  );

  // Avaliadas vs. realizadas
  $('evalValue').textContent = String(kpis.evaluated);
  $('heldValue').textContent = `/ ${kpis.held}`;
  const cov = kpis.coverage ?? 0;
  $('coverageMeter').setAttribute('aria-label', `${fmtPct(kpis.coverage)} das reuniões realizadas já têm nota`);
  requestAnimationFrame(() => { $('coverageFill').style.width = `${Math.round(cov * 100)}%`; });
  const foot = [`${fmtPct(kpis.coverage)} com nota`];
  if (kpis.pendingHuman) foot.push(`${kpis.pendingHuman} aguardando humano`);
  if (kpis.noShows) foot.push(plural(kpis.noShows, 'no-show', 'no-shows'));
  $('evalFoot').textContent = foot.join(' · ');

  // Na meta
  $('targetValue').textContent = fmtPct(kpis.targetRate);
  const ppDelta = kpis.targetRate !== null && kpis.previousTargetRate !== null ? kpis.targetRate - kpis.previousTargetRate : null;
  $('targetFoot').replaceChildren(
    h('b', '', `${kpis.onTarget} de ${kpis.evaluated}`),
    document.createTextNode(` com nota ≥ ${fmtScore(TARGET_SCORE)}`),
    h('br'),
    h('span', '', ppDelta === null ? '' : `${fmtPp(ppDelta)} vs. ${g.previous}`),
  );
  renderRing($('targetRing'), kpis.targetRate, {
    color: '#00B914', track: '#E3F9E4', label: `${fmtPct(kpis.targetRate)} das reuniões na meta`,
  });
  $('targetRingLabel').textContent = '🎯';

  // Composição
  $('aiValue').textContent = fmtScore(kpis.aiAverage);
  $('humanValue').textContent = fmtScore(kpis.humanAverage);
  const total = SCORE_WEIGHTS.ai + SCORE_WEIGHTS.human;
  $('weightsFoot').textContent = `Nota final = ${Math.round((SCORE_WEIGHTS.ai / total) * 100)}% IA + ${Math.round((SCORE_WEIGHTS.human / total) * 100)}% humana. Sem avaliação humana, vale a da IA (provisória).`;
}

/** @param {DashboardData} d */
function renderSeriesToggle(d) {
  const box = $('seriesToggle');
  box.replaceChildren(...SERIES.map((s) => {
    const b = h('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(ui.visible[s.key]));
    const key = h('i');
    key.style.background = s.color;
    b.append(key, document.createTextNode(s.label));
    b.addEventListener('click', () => {
      const on = !ui.visible[s.key];
      if (!on && Object.values(ui.visible).filter(Boolean).length === 1) return; // mantém ao menos uma
      ui.visible[s.key] = on;
      renderSeriesToggle(d);
      renderTrend(d);
    });
    return b;
  }));
  const g = GRANULARITY_LABELS[d.period.granularity];
  const by = { week: 'dia a dia', month: 'semana a semana', quarter: 'semana a semana', year: 'mês a mês' }[d.period.granularity];
  $('trendSub').textContent = `Média ${by} n${g.article} ${g.unit} · meta ${fmtScore(TARGET_SCORE)}`;
}

/** @param {DashboardData} d */
function renderTrend(d) {
  const box = $('trendChart');
  if (!box.clientWidth) return;
  renderTrendChart(box, {
    buckets: d.trend,
    series: SERIES.filter((s) => ui.visible[s.key]),
    target: TARGET_SCORE,
    ariaLabel: `Evolução da nota média em ${d.period.label}. Última média: ${fmtScore(d.kpis.average)}.`,
  });
}

/** @param {DashboardData} d */
function renderTrendSummary(d) {
  const pts = d.trend.filter((b) => b.final !== null);
  const best = pts.reduce((a, b) => (a && /** @type {number} */ (a.final) >= /** @type {number} */ (b.final) ? a : b), /** @type {import('./lib/types.js').Bucket | null} */ (null));
  const worst = pts.reduce((a, b) => (a && /** @type {number} */ (a.final) <= /** @type {number} */ (b.final) ? a : b), /** @type {import('./lib/types.js').Bucket | null} */ (null));
  const above = pts.filter((b) => /** @type {number} */ (b.final) >= TARGET_SCORE).length;
  /** @param {string} t @param {string} n @param {string} sub */
  const cell = (t, n, sub) => {
    const c = h('div', 'cell');
    const num = h('div', 'n', n);
    if (sub) num.appendChild(h('small', '', sub));
    c.append(h('div', 't', t), num);
    return c;
  };
  $('trendSummary').replaceChildren(
    cell('Melhor ponto', fmtScore(best?.final), best?.label ?? ''),
    cell('Pior ponto', fmtScore(worst?.final), worst?.label ?? ''),
    cell('Pontos na meta', pts.length ? `${above} de ${pts.length}` : '–', ''),
  );
}

/** @param {DashboardData} d */
function renderTrendTable(d) {
  const t = $('trendTable');
  const head = h('tr');
  ['Período', 'Nota final', 'IA', 'Humana', 'Reuniões'].forEach((c, i) => head.appendChild(h('th', i ? 'num' : '', c)));
  const rows = d.trend.map((b) => {
    const tr = h('tr');
    tr.style.cursor = 'default';
    [b.longLabel, fmtScore(b.final), fmtScore(b.ai), fmtScore(b.human), String(b.count)].forEach((c, i) => tr.appendChild(h('td', i ? 'num' : '', c)));
    return tr;
  });
  const thead = h('thead');
  thead.appendChild(head);
  const tbody = h('tbody');
  tbody.append(...rows);
  t.replaceChildren(thead, tbody);
}

const INSIGHT_ICONS = /** @type {Record<string, string>} */ ({
  delta: '📈', strength: '💪', focus: '🎯', streak: '🔥', trend: '📈', calibration: '⚖️', team: '👥', best: '🏆', pending: '⏳',
});

/** @param {DashboardData} d */
function renderInsights(d) {
  const box = $('insights');
  if (!d.insights.length) {
    box.replaceChildren(h('div', 'mini-empty', 'Ainda não há notas suficientes para gerar insights neste período.'));
    return;
  }
  box.replaceChildren(...d.insights.map((i) => {
    const el = h('div', `insight ${i.tone}`);
    let icon = INSIGHT_ICONS[i.id] ?? '💡';
    if ((i.id === 'delta' || i.id === 'trend') && i.tone === 'negative') icon = '📉';
    const ico = h('div', 'ico', icon);
    ico.setAttribute('aria-hidden', 'true');
    const body = h('div');
    body.append(h('b', '', i.title), h('p', '', i.body));
    if (i.action) {
      const a = h('a', '', `${i.action.label} →`);
      a.href = i.action.href;
      body.appendChild(a);
    }
    el.append(ico, body);
    return el;
  }));
}

/** @param {DashboardData} d */
function renderQuarters(d) {
  const show = d.period.granularity === 'quarter' || d.period.granularity === 'year';
  $('quartersPanel').hidden = !show;
  if (!show) return;
  $('quartersTitle').textContent = `${d.period.start.getFullYear()} em trimestres`;
  $('quarters').replaceChildren(...d.quarters.map((q) => {
    const b = h('button', 'q-card');
    b.type = 'button';
    const selected = d.period.granularity === 'quarter' && q.period.start.getTime() === d.period.start.getTime();
    b.classList.toggle('selected', selected);
    b.disabled = q.future;
    const top = h('div', 'q');
    top.append(h('span', '', q.label), h('span', '', q.current ? 'em andamento' : q.future ? 'futuro' : ''));
    const meter = h('div', 'meter');
    const fill = h('i', 'a');
    fill.style.width = q.average === null ? '0%' : `${Math.round((q.average / 10) * 100)}%`;
    meter.appendChild(fill);
    b.append(top, h('div', 'v', fmtScore(q.average)), meter, h('div', 'c', q.future ? '—' : plural(q.count, 'reunião avaliada', 'reuniões avaliadas')));
    b.setAttribute('aria-label', `${q.label}: média ${fmtScore(q.average)}, ${q.count} reuniões avaliadas`);
    b.addEventListener('click', async () => {
      await metrics.setGranularity('quarter');
      const cur = metrics.getState().period;
      const diffQ = (q.period.start.getFullYear() - cur.start.getFullYear()) * 4 + (q.period.start.getMonth() - cur.start.getMonth()) / 3;
      if (diffQ) metrics.shift(diffQ);
    });
    return b;
  }));
}

/** @param {DashboardData} d */
function renderDistribution(d) {
  const max = Math.max(1, ...d.distribution.map((b) => b.count));
  const box = $('distribution');
  box.replaceChildren(...d.distribution.map((band, i) => {
    const row = h('div', 'hbar');
    row.tabIndex = 0;
    const track = h('div', 'track');
    const fill = h('div', 'fill');
    fill.style.background = COLORS.bands[i];
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = `${(band.count / max) * 100}%`; });
    track.appendChild(fill);
    const val = h('div', 'value', String(band.count));
    val.appendChild(h('small', 'flat', fmtPct(band.share)));
    row.append(h('div', 'name', band.label), track, val);
    row.setAttribute('aria-label', `${band.label}: ${band.count} reuniões (${fmtPct(band.share)})`);
    bindTip(row, () => ({
      title: `Notas ${band.label.toLowerCase()}`,
      rows: [{ value: String(band.count), label: band.count === 1 ? 'reunião' : 'reuniões', color: COLORS.bands[i] }, { value: fmtPct(band.share), label: 'do total' }],
    }));
    return row;
  }));
}

/** @param {DashboardData} d */
function renderDimensions(d) {
  const box = $('dimensions');
  const withAvg = d.dimensions.filter((x) => x.average !== null);
  const weakest = withAvg.length ? withAvg.reduce((a, b) => (/** @type {number} */ (b.average) < /** @type {number} */ (a.average) ? b : a)) : null;
  const g = GRANULARITY_LABELS[d.period.granularity];
  box.replaceChildren(...d.dimensions.map((dim) => {
    const row = h('div', `hbar${weakest && dim.key === weakest.key && withAvg.length > 1 ? ' weakest' : ''}`);
    row.tabIndex = 0;
    const track = h('div', 'track');
    const fill = h('div', 'fill');
    fill.style.background = COLORS.final;
    fill.style.width = '0%';
    requestAnimationFrame(() => { fill.style.width = `${((dim.average ?? 0) / 10) * 100}%`; });
    track.appendChild(fill);
    if (dim.previousAverage !== null) {
      const tick = h('div', 'prev-tick');
      tick.style.left = `calc(${(dim.previousAverage / 10) * 100}% - 1px)`;
      track.appendChild(tick);
    }
    const target = h('div', 'target-tick');
    target.style.left = `${(TARGET_SCORE / 10) * 100}%`;
    track.appendChild(target);
    const val = h('div', 'value', fmtScore(dim.average));
    val.appendChild(h('small', dirClass(dim.delta), dim.delta === null ? '–' : `${arrow(dim.delta)} ${fmtDelta(dim.delta)}`));
    const short = DIMENSIONS.find((x) => x.key === dim.key)?.short ?? dim.label;
    const name = h('div', 'name', short);
    name.title = dim.label;
    row.append(name, track, val);
    row.setAttribute('aria-label', `${dim.label}: ${fmtScore(dim.average)}, ${fmtDelta(dim.delta)} vs. ${g.previous}`);
    bindTip(row, () => ({
      title: dim.label,
      rows: [
        { value: fmtScore(dim.average), label: 'nota final', color: COLORS.final },
        { value: fmtScore(dim.ai), label: 'IA', color: COLORS.ai },
        { value: fmtScore(dim.human), label: 'humana', color: COLORS.human },
        { value: fmtScore(dim.previousAverage), label: g.previous },
      ],
    }));
    return row;
  }));
}

/** @param {DashboardData} d */
function renderMeetings(d) {
  const all = d.recent.filter((m) => m.status === 'realizada');
  const filtered = all.filter((m) => {
    if (ui.listFilter === 'below') return m.score !== null && m.score.value < TARGET_SCORE;
    if (ui.listFilter === 'pending') return m.score !== null && m.score.human === null;
    return true;
  });
  const visible = filtered.slice(0, ui.listLimit);
  $('meetingsSub').textContent = `${plural(all.length, 'reunião realizada', 'reuniões realizadas')} em ${d.period.label}. Clique para ver o detalhe.`;

  $('meetingsBody').replaceChildren(...visible.map((m) => {
    const tr = h('tr');
    tr.tabIndex = 0;
    tr.setAttribute('aria-label', `Ver detalhes da reunião com ${m.company}`);
    const date = h('td', 'date', fmtDateTimeShort(m.date));
    const lead = h('td', 'lead');
    lead.append(h('b', '', m.company), h('span', '', `${m.leadName} · ${m.durationMin} min`));
    const fin = h('td', 'num final');
    fin.appendChild(scoreBadge(m));
    const ai = h('td', 'num ai');
    ai.appendChild(h('span', 'sub-score', fmtScore(m.score?.ai)));
    const hu = h('td', 'num human');
    hu.appendChild(m.score && m.score.human === null ? h('span', 'sub-score pending', 'pendente') : h('span', 'sub-score', fmtScore(m.score?.human)));
    const fb = h('td', 'fb');
    fb.appendChild(h('span', '', m.evaluation?.feedback ?? 'Aguardando avaliação.'));
    const go = h('td', 'go', '→');
    go.style.color = 'var(--text-tertiary)';
    tr.append(date, lead, fin, ai, hu, fb, go);
    tr.addEventListener('click', () => openMeeting(m));
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMeeting(m); } });
    return tr;
  }));

  const empty = $('meetingsEmpty');
  empty.hidden = filtered.length > 0;
  empty.textContent = ui.listFilter === 'below' ? 'Nenhuma reunião abaixo da meta neste período. 🎉'
    : ui.listFilter === 'pending' ? 'Todas as reuniões já têm avaliação humana.' : 'Nenhuma reunião neste período.';
  const more = $('moreBtn');
  more.hidden = filtered.length <= ui.listLimit;
  more.textContent = `Ver mais reuniões (${filtered.length - visible.length})`;
}

/* ----------------------------------------------------------------- modal */

const modal = /** @type {HTMLDialogElement} */ ($('meetingModal'));
$('modalClose').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

/** @param {ScoredMeeting} m */
function openMeeting(m) {
  hideTip();
  $('modalTitle').textContent = m.company;
  $('modalSub').textContent = `${m.leadName} · ${fmtDateTimeShort(m.date)} · ${m.durationMin} min`;
  const body = $('modalBody');
  const s = m.score;
  const ev = m.evaluation;

  const trio = h('div', 'score-trio');
  /** @param {string} cls @param {string} label @param {string} value @param {string} sub @param {string} [color] */
  const cell = (cls, label, value, sub, color) => {
    const c = h('div', `cell ${cls}`);
    const t = h('div', 't');
    if (color) { const i = h('i'); i.style.background = color; t.appendChild(i); }
    t.appendChild(document.createTextNode(label));
    c.append(t, h('div', 'n', value), h('div', 's', sub));
    return c;
  };
  trio.append(
    cell('main', 'Nota final', fmtScore(s?.value), s ? (s.provisional ? 'provisória' : 'IA + humana') : 'sem nota'),
    cell('', 'IA', fmtScore(s?.ai), ev?.ai?.evaluator ?? 'pendente', COLORS.ai),
    cell('', 'Humana', fmtScore(s?.human), ev?.human?.evaluator ?? 'pendente', COLORS.human),
  );
  const parts = [trio];

  if (ev) {
    const wrap = h('div');
    wrap.appendChild(h('h4', '', 'Notas por subcritério'));
    const t = h('table', 'dim-table');
    const head = h('tr');
    ['Subcritério', 'IA', 'Humana', 'Final'].forEach((c) => head.appendChild(h('th', '', c)));
    const thead = h('thead');
    thead.appendChild(head);
    const tbody = h('tbody');
    for (const dim of DIMENSIONS) {
      const tr = h('tr');
      const fin = computeDimensionScore(ev, dim.key);
      tr.append(
        h('td', '', dim.label),
        h('td', '', fmtScore(ev.ai?.dimensions[dim.key])),
        h('td', '', fmtScore(ev.human?.dimensions[dim.key])),
        h('td', `f`, fmtScore(fin?.value)),
      );
      tbody.appendChild(tr);
    }
    t.append(thead, tbody);
    wrap.appendChild(t);
    parts.push(wrap);

    if (ev.feedback) {
      const fb = h('div');
      fb.append(h('h4', '', 'Feedback'), h('div', 'quote', ev.feedback));
      parts.push(fb);
    }
    const cols = h('div', 'two-col');
    if (ev.highlights?.length) {
      const c = h('div');
      const ul = h('ul', 'bullets');
      ul.append(...ev.highlights.map((x) => h('li', '', x)));
      c.append(h('h4', '', 'Pontos fortes'), ul);
      cols.appendChild(c);
    }
    if (ev.improvements?.length) {
      const c = h('div');
      const ul = h('ul', 'bullets warn');
      ul.append(...ev.improvements.map((x) => h('li', '', x)));
      c.append(h('h4', '', 'Para evoluir'), ul);
      cols.appendChild(c);
    }
    if (cols.childElementCount) parts.push(cols);
  } else {
    parts.push(h('div', 'mini-empty', 'Esta reunião ainda não foi avaliada pela IA nem por um avaliador.'));
  }

  const foot = h('div', 'modal-foot');
  const total = SCORE_WEIGHTS.ai + SCORE_WEIGHTS.human;
  const note = h('span', 'weights-note', `Peso: ${Math.round((SCORE_WEIGHTS.ai / total) * 100)}% IA · ${Math.round((SCORE_WEIGHTS.human / total) * 100)}% humana`);
  note.style.marginRight = 'auto';
  note.style.alignSelf = 'center';
  const rec = h('a', 'btn btn-ghost btn-sm', '▶ Ouvir gravação');
  rec.href = m.recordingUrl ?? '#';
  if (provider.name === 'mock') {
    rec.addEventListener('click', (e) => { e.preventDefault(); rec.textContent = 'Disponível após a integração'; });
  } else {
    rec.target = '_blank';
    rec.rel = 'noopener';
  }
  const close = h('button', 'btn btn-primary btn-sm', 'Fechar');
  close.addEventListener('click', () => modal.close());
  foot.append(note, rec, close);
  parts.push(foot);

  body.replaceChildren(...parts);
  modal.showModal();
}

/* ---------------------------------------------------------------- estados */

function skeleton() {
  const wrap = h('div', 'dash');
  wrap.setAttribute('aria-busy', 'true');
  wrap.appendChild(h('span', 'sr-only', 'Carregando notas…'));
  const kpi = h('div', 'grid-kpi');
  kpi.append(h('div', 'skel skel-hero'), h('div', 'skel skel-tile'), h('div', 'skel skel-tile'), h('div', 'skel skel-tile'), h('div', 'skel skel-tile'));
  const charts = h('div', 'grid-2-1');
  charts.append(h('div', 'skel skel-chart'), h('div', 'skel skel-chart'));
  wrap.append(kpi, charts);
  return wrap;
}

/** @param {string | null} message */
function errorState(message) {
  const card = h('div', 'panel state-card error');
  card.setAttribute('role', 'alert');
  const btn = h('button', 'btn btn-primary', 'Tentar de novo');
  btn.addEventListener('click', () => (metrics.getState().closer ? metrics.retry() : metrics.init(email, { closerId: params.get('closer') ?? undefined })));
  const actions = h('div', 'actions');
  actions.appendChild(btn);
  if (demo === 'erro') {
    const a = h('a', 'btn btn-ghost', 'Sair da simulação de erro');
    a.href = '?';
    actions.appendChild(a);
  }
  card.append(h('div', 'art', '⚠️'), h('h3', '', 'Não conseguimos carregar suas notas'), h('p', '', message ?? 'Erro desconhecido.'), actions);
  return card;
}

/** @param {MetricsState} s */
function emptyState(s) {
  const d = /** @type {DashboardData} */ (s.data);
  const g = GRANULARITY_LABELS[s.granularity];
  const card = h('div', 'panel state-card');
  const held = d.kpis.held;
  const text = held > 0
    ? `Você fez ${plural(held, 'reunião', 'reuniões')} em ${s.period.label}, mas nenhuma tem nota ainda. Assim que a IA e o avaliador concluírem, a evolução aparece aqui.`
    : `Não há reuniões avaliadas em ${s.period.label}. Que tal olhar ${g.article === 'a' ? 'a' : 'o'} ${g.previous} ou se preparar para a próxima call com o guia?`;
  const actions = h('div', 'actions');
  const prev = h('button', 'btn btn-primary', `← Ver ${g.previous}`);
  prev.addEventListener('click', () => metrics.shift(-1));
  const guide = h('a', 'btn btn-ghost', 'Abrir guia do Closer');
  guide.href = '../closer/index.html';
  actions.append(prev, guide);
  if (!s.isCurrent) {
    const cur = h('button', 'btn btn-ghost', `Ir para ${g.article === 'a' ? 'esta' : 'este'} ${g.unit}`);
    cur.addEventListener('click', () => metrics.goToCurrent());
    actions.appendChild(cur);
  }
  if (demo === 'vazio') {
    const a = h('a', 'btn btn-ghost', 'Sair da simulação');
    a.href = '?';
    actions.appendChild(a);
  }
  card.append(h('div', 'art', held > 0 ? '⏳' : '🗓️'), h('h3', '', held > 0 ? 'Notas a caminho' : 'Nenhuma nota neste período'), h('p', '', text), actions);
  return card;
}

/* ------------------------------------------------------------------ start */

metrics.subscribe(render);
metrics.init(email, { closerId: params.get('closer') ?? undefined });

// expõe para depuração no console
/** @type {any} */ (window).closerMetrics = metrics;
