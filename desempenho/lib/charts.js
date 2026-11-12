// @ts-check
/**
 * Gráficos do painel em SVG/HTML puro (o Hub não tem dependências nem build).
 * Especificações: linhas de 2px, área a 10%, grade em hairline sólida, marcadores
 * com anel da cor da superfície, rótulos diretos só no ponto final, tooltip com
 * crosshair e navegação por teclado. Textos sempre via textContent.
 */
import { fmtScore } from './format.js';

/** @typedef {import('./types.js').Bucket} Bucket */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {Element} [parent]
 * @returns {SVGElement}
 */
function svg(tag, attrs = {}, parent) {
  const el = /** @type {SVGElement} */ (document.createElementNS(SVG_NS, tag));
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (parent) parent.appendChild(el);
  return el;
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/* ------------------------------------------------------------------------ */
/* Tooltip compartilhado                                                      */
/* ------------------------------------------------------------------------ */

/** @type {HTMLDivElement | null} */
let tipEl = null;

function tooltip() {
  if (!tipEl) {
    tipEl = h('div', 'chart-tip');
    tipEl.setAttribute('role', 'status');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

/**
 * @typedef {Object} TipRow
 * @property {string} value
 * @property {string} label
 * @property {string} [color]   Cor da série (vira uma linha-chave curta, nunca o texto).
 */

/**
 * Mostra o tooltip ancorado num ponto da página.
 * @param {string} title
 * @param {TipRow[]} rows
 * @param {number} x   clientX
 * @param {number} y   clientY
 */
export function showTip(title, rows, x, y) {
  const t = tooltip();
  t.replaceChildren();
  t.appendChild(h('div', 'chart-tip-title', title));
  for (const r of rows) {
    const row = h('div', 'chart-tip-row');
    if (r.color) {
      const key = h('span', 'chart-tip-key');
      key.style.background = r.color;
      row.appendChild(key);
    }
    row.appendChild(h('b', '', r.value));
    row.appendChild(h('span', '', r.label));
    t.appendChild(row);
  }
  t.hidden = false;
  const pad = 14;
  const { width, height } = t.getBoundingClientRect();
  let left = x + pad;
  if (left + width > window.innerWidth - 8) left = x - width - pad;
  let top = y - height - pad;
  if (top < 8) top = y + pad;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${top}px`;
}

export function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

/**
 * Liga tooltip de hover/foco num elemento (barras, células).
 * @param {HTMLElement} el
 * @param {() => { title: string, rows: TipRow[] }} content
 */
export function bindTip(el, content) {
  /** @param {number} x @param {number} y */
  const show = (x, y) => { const c = content(); showTip(c.title, c.rows, x, y); };
  el.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('focus', () => {
    const r = el.getBoundingClientRect();
    show(r.left + r.width / 2, r.top);
  });
  el.addEventListener('blur', hideTip);
}

/* ------------------------------------------------------------------------ */
/* Gráfico de tendência                                                       */
/* ------------------------------------------------------------------------ */

/**
 * @typedef {Object} TrendSeries
 * @property {'final' | 'ai' | 'human'} key
 * @property {string} label
 * @property {string} color
 * @property {boolean} [area]
 * @property {boolean} [primary]
 */

/**
 * @param {HTMLElement} container
 * @param {Object} opts
 * @param {Bucket[]} opts.buckets
 * @param {TrendSeries[]} opts.series      Séries visíveis.
 * @param {number} opts.target
 * @param {string} opts.ariaLabel
 */
export function renderTrendChart(container, { buckets, series, target, ariaLabel }) {
  container.replaceChildren();
  const width = Math.max(280, container.clientWidth);
  const height = width < 520 ? 220 : 270;
  const m = { top: 18, right: width < 520 ? 34 : 46, bottom: 30, left: 30 };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;

  /** @type {number[]} */
  const values = [];
  for (const b of buckets) for (const s of series) { const v = b[s.key]; if (v !== null) values.push(v); }
  const lo = Math.max(0, Math.min(Math.floor((Math.min(...values, target) - 0.6) * 2) / 2, 7));
  const yMin = Number.isFinite(lo) ? Math.floor(lo) : 6;
  const yMax = 10;

  const n = buckets.length;
  /** @param {number} i */
  const x = (i) => m.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  /** @param {number} v */
  const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`, width, height, class: 'trend-svg', role: 'img', 'aria-label': ariaLabel,
  });

  // grade + eixo Y
  const step = yMax - yMin > 5 ? 2 : 1;
  for (let v = yMin; v <= yMax; v += step) {
    svg('line', { x1: m.left, x2: width - m.right, y1: y(v), y2: y(v), class: 'grid' }, root);
    const t = svg('text', { x: m.left - 8, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' }, root);
    t.textContent = String(v);
  }

  // eixo X (rótulos espaçados para não colidir)
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 46))));
  const shown = new Set(buckets.map((_, i) => i).filter((i) => i % every === 0));
  if (!shown.has(n - 1)) {
    const prev = Math.floor((n - 1) / every) * every;
    if (prev !== 0 && n - 1 - prev < every * 0.75) shown.delete(prev); // evita colisão com o último rótulo
    shown.add(n - 1);
  }
  buckets.forEach((b, i) => {
    if (!shown.has(i)) return;
    const t = svg('text', {
      x: x(i), y: height - 8, class: `axis${b.future ? ' future' : ''}`,
      'text-anchor': i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle',
    }, root);
    t.textContent = b.label;
  });

  // linha da meta (referência)
  if (target >= yMin && target <= yMax) {
    svg('line', { x1: m.left, x2: width - m.right, y1: y(target), y2: y(target), class: 'target-line' }, root);
    const tl = svg('text', { x: width - m.right + 6, y: y(target) + 4, class: 'target-label' }, root);
    tl.textContent = `Meta ${fmtScore(target)}`;
  }

  /** Segmentos contínuos (quebra em buckets sem nota). @param {'final' | 'ai' | 'human'} key */
  const segments = (key) => {
    /** @type {{ i: number, v: number }[][]} */
    const segs = [];
    /** @type {{ i: number, v: number }[]} */
    let cur = [];
    buckets.forEach((b, i) => {
      const v = b[key];
      if (v === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push({ i, v });
    });
    if (cur.length) segs.push(cur);
    return segs;
  };

  // séries secundárias primeiro, principal por cima
  const ordered = [...series].sort((a, b) => Number(!!a.primary) - Number(!!b.primary));
  for (const s of ordered) {
    for (const seg of segments(s.key)) {
      if (s.area && seg.length > 1) {
        const d = `M${x(seg[0].i)},${y(yMin)} ${seg.map((p) => `L${x(p.i)},${y(p.v)}`).join(' ')} L${x(seg[seg.length - 1].i)},${y(yMin)} Z`;
        svg('path', { d, fill: s.color, 'fill-opacity': 0.1, stroke: 'none' }, root);
      }
      if (seg.length > 1) {
        svg('path', {
          d: seg.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' '),
          fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          'stroke-opacity': s.primary ? 1 : 0.85,
        }, root);
      } else {
        svg('circle', { cx: x(seg[0].i), cy: y(seg[0].v), r: 3.5, fill: s.color, class: 'ring' }, root);
      }
    }
  }

  // ponto final da série principal com rótulo direto
  const primary = series.find((s) => s.primary) ?? series[0];
  if (primary) {
    let last = -1;
    buckets.forEach((b, i) => { if (b[primary.key] !== null) last = i; });
    if (last >= 0) {
      const v = /** @type {number} */ (buckets[last][primary.key]);
      svg('circle', { cx: x(last), cy: y(v), r: 5, fill: primary.color, class: 'ring' }, root);
      const lbl = svg('text', {
        x: x(last), y: y(v) - 12, class: 'end-label',
        'text-anchor': last === n - 1 ? 'end' : last === 0 ? 'start' : 'middle',
      }, root);
      lbl.textContent = fmtScore(v);
    }
  }

  // camada de interação: crosshair + marcadores + tooltip
  const cross = svg('line', { y1: m.top, y2: m.top + ih, class: 'crosshair', visibility: 'hidden' }, root);
  const hoverDots = series.map((s) => svg('circle', { r: 4.5, fill: s.color, class: 'ring', visibility: 'hidden' }, root));
  const hit = svg('rect', { x: m.left - 12, y: 0, width: iw + 24, height, fill: 'transparent', class: 'hit' }, root);
  container.appendChild(root);
  container.tabIndex = 0;

  let active = -1;
  /** @param {number} i @param {number} [cx] @param {number} [cy] */
  const focusIndex = (i, cx, cy) => {
    active = Math.max(0, Math.min(n - 1, i));
    const b = buckets[active];
    cross.setAttribute('x1', String(x(active)));
    cross.setAttribute('x2', String(x(active)));
    cross.setAttribute('visibility', 'visible');
    series.forEach((s, k) => {
      const v = b[s.key];
      const dot = hoverDots[k];
      if (v === null) { dot.setAttribute('visibility', 'hidden'); return; }
      dot.setAttribute('cx', String(x(active)));
      dot.setAttribute('cy', String(y(v)));
      dot.setAttribute('visibility', 'visible');
    });
    const rect = root.getBoundingClientRect();
    const scale = rect.width / width;
    const px = cx ?? rect.left + x(active) * scale;
    const py = cy ?? rect.top + m.top * scale + 30;
    const rows = series.map((s) => ({ value: fmtScore(b[s.key]), label: s.label, color: s.color }));
    rows.push({ value: String(b.count), label: b.count === 1 ? 'reunião avaliada' : 'reuniões avaliadas', color: '' });
    showTip(b.future ? `${b.longLabel} · ainda não aconteceu` : b.longLabel, rows, px, py);
  };
  const clear = () => {
    active = -1;
    cross.setAttribute('visibility', 'hidden');
    hoverDots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    hideTip();
  };

  hit.addEventListener('pointermove', (e) => {
    const ev = /** @type {PointerEvent} */ (e);
    const rect = root.getBoundingClientRect();
    const sx = ((ev.clientX - rect.left) / rect.width) * width;
    const i = n === 1 ? 0 : Math.round(((sx - m.left) / iw) * (n - 1));
    focusIndex(i, ev.clientX, ev.clientY);
  });
  hit.addEventListener('pointerleave', clear);
  container.onkeydown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); focusIndex(active < 0 ? 0 : active + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusIndex(active < 0 ? n - 1 : active - 1); }
    else if (e.key === 'Escape') clear();
  };
  container.onfocus = () => { if (active < 0) focusIndex(n - 1); };
  container.onblur = clear;
}

/* ------------------------------------------------------------------------ */
/* Sparkline                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * @param {HTMLElement} container
 * @param {number[]} values  NaN = sem dado.
 * @param {{ muted: string, accent: string, label: string }} colors
 */
export function renderSparkline(container, values, colors) {
  container.replaceChildren();
  const w = 120;
  const hgt = 36;
  const pts = values.map((v, i) => ({ i, v })).filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return;
  const min = Math.min(...pts.map((p) => p.v)) - 0.2;
  const max = Math.max(...pts.map((p) => p.v)) + 0.2;
  /** @param {number} i */
  const x = (i) => 4 + (i / (values.length - 1)) * (w - 8);
  /** @param {number} v */
  const y = (v) => 4 + (1 - (v - min) / (max - min || 1)) * (hgt - 8);
  const root = svg('svg', { viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, role: 'img', 'aria-label': colors.label });
  svg('path', {
    d: pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.v)}`).join(' '),
    fill: 'none', stroke: colors.muted, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }, root);
  const last = pts[pts.length - 1];
  svg('circle', { cx: x(last.i), cy: y(last.v), r: 4, fill: colors.accent, class: 'ring' }, root);
  container.appendChild(root);
}

/* ------------------------------------------------------------------------ */
/* Anel de progresso (meta)                                                   */
/* ------------------------------------------------------------------------ */

/**
 * @param {HTMLElement} container
 * @param {number | null} ratio 0..1
 * @param {{ color: string, track: string, label: string }} opts
 */
export function renderRing(container, ratio, opts) {
  container.replaceChildren();
  const size = 64;
  const r = 26;
  const c = 2 * Math.PI * r;
  const root = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': opts.label });
  svg('circle', { cx: 32, cy: 32, r, fill: 'none', stroke: opts.track, 'stroke-width': 7 }, root);
  if (ratio !== null && ratio > 0) {
    svg('circle', {
      cx: 32, cy: 32, r, fill: 'none', stroke: opts.color, 'stroke-width': 7, 'stroke-linecap': 'round',
      'stroke-dasharray': `${c * Math.min(1, ratio)} ${c}`, transform: 'rotate(-90 32 32)', class: 'ring-progress',
    }, root);
  }
  container.appendChild(root);
}
