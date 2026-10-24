/* Gráficos em SVG puro: radar dos fatores e barras por mês. */

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

/* series: [{ values: {key: 0–5}, color }]; axes: [{ key, label }] */
export function radarChart(axes, series, { max = 5, size = 280 } = {}) {
  const pad = 46;
  const r = size / 2 - pad;
  const c = size / 2;
  // Margem lateral extra para os rótulos não serem cortados.
  const side = 34;
  const svg = el('svg', { viewBox: `${-side} 0 ${size + side * 2} ${size}`, class: 'radar', role: 'img' });
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
  const pt = (i, v) => [c + Math.cos(angle(i)) * r * (v / max), c + Math.sin(angle(i)) * r * (v / max)];

  for (let ring = 1; ring <= max; ring++) {
    const pts = axes.map((_, i) => pt(i, ring).join(',')).join(' ');
    svg.append(el('polygon', { points: pts, class: 'radar-grid' }));
  }
  axes.forEach((a, i) => {
    const [x, y] = pt(i, max);
    svg.append(el('line', { x1: c, y1: c, x2: x, y2: y, class: 'radar-grid' }));
    const [lx, ly] = pt(i, max + 0.75);
    const anchor = Math.abs(lx - c) < 4 ? 'middle' : lx > c ? 'start' : 'end';
    svg.append(el('text', { x: lx, y: ly + 4, 'text-anchor': anchor, class: 'radar-label' }, a.label));
  });
  for (const s of series) {
    const pts = axes.map((a, i) => pt(i, s.values[a.key] ?? 0).join(',')).join(' ');
    svg.append(el('polygon', { points: pts, fill: s.color, 'fill-opacity': 0.28, stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    axes.forEach((a, i) => {
      const [x, y] = pt(i, s.values[a.key] ?? 0);
      svg.append(el('circle', { cx: x, cy: y, r: 3.5, fill: s.color }));
    });
  }
  return svg;
}

/* data: [{ label, value }] — barras verticais com rótulo do valor no topo. */
export function barChart(data, { height = 170, unit = '' } = {}) {
  const w = 320;
  const top = 22;
  const bottom = 22;
  const max = Math.max(...data.map((d) => d.value), 0.0001);
  const slot = w / data.length;
  const bw = Math.min(26, slot * 0.62);
  const svg = el('svg', { viewBox: `0 0 ${w} ${height}`, class: 'bars', role: 'img' });
  svg.append(el('line', { x1: 0, y1: height - bottom, x2: w, y2: height - bottom, class: 'bar-axis' }));
  data.forEach((d, i) => {
    const h = ((height - top - bottom) * d.value) / max;
    const x = i * slot + (slot - bw) / 2;
    const y = height - bottom - h;
    if (d.value > 0) {
      svg.append(el('rect', { x, y, width: bw, height: h, rx: 4, class: 'bar' }));
      svg.append(el('text', { x: x + bw / 2, y: y - 5, 'text-anchor': 'middle', class: 'bar-value' },
        d.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + unit));
    }
    svg.append(el('text', { x: x + bw / 2, y: height - 6, 'text-anchor': 'middle', class: 'bar-label' }, d.label));
  });
  return svg;
}
