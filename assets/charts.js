/* Gráfico de linhas em SVG — sem dependências externas. */

import { fmt, fmtDate } from './calc.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function niceTicks(min, max, count = 4) {
  if (min === max) {
    const pad = Math.abs(min) * 0.05 || 1;
    min -= pad; max += pad;
  }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

const decimalsFor = (span) => (span >= 20 ? 0 : span >= 2 ? 1 : 2);

/**
 * @param {HTMLElement} host
 * @param {{series: {label:string,color:string,points:{x:string,y:number}[]}[], unit?:string, emptyNote?:string}} cfg
 */
export function lineChart(host, cfg) {
  if (host._cleanup) host._cleanup();
  host.innerHTML = '';

  const series = (cfg.series || []).filter((s) => s.points && s.points.length);
  if (!series.length) {
    const note = document.createElement('div');
    note.className = 'empty-note';
    note.textContent = cfg.emptyNote || 'Sem dados suficientes para este gráfico.';
    host.appendChild(note);
    return;
  }

  const draw = () => {
    host.querySelectorAll('svg, .chart-tip, .chart-legend').forEach((n) => n.remove());

    const legendH = series.length > 1 ? 26 : 0; // espaço reservado abaixo do SVG
    const W = Math.max(host.clientWidth, 240);
    const H = Math.max(host.clientHeight - legendH, 130);
    const pad = { top: 12, right: 12, bottom: 24, left: 40 };
    const iw = W - pad.left - pad.right;
    const ih = H - pad.top - pad.bottom;

    const times = series.flatMap((s) => s.points.map((p) => new Date(p.x + 'T00:00:00').getTime()));
    const values = series.flatMap((s) => s.points.map((p) => p.y));
    let t0 = Math.min(...times), t1 = Math.max(...times);
    if (t0 === t1) { t0 -= 86400000; t1 += 86400000; }

    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const v0 = ticks[0], v1 = ticks[ticks.length - 1];
    const dec = decimalsFor(v1 - v0);

    const sx = (t) => pad.left + ((t - t0) / (t1 - t0)) * iw;
    const sy = (v) => pad.top + ih - ((v - v0) / (v1 - v0 || 1)) * ih;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': cfg.ariaLabel || 'Gráfico de evolução' });

    // grade + eixo Y
    for (const t of ticks) {
      const y = sy(t);
      svg.appendChild(el('line', { class: 'c-grid', x1: pad.left, x2: W - pad.right, y1: y, y2: y }));
      const label = el('text', { class: 'c-axis', x: pad.left - 6, y: y + 3.5, 'text-anchor': 'end' });
      label.textContent = fmt(t, dec);
      svg.appendChild(label);
    }

    // eixo X (primeira, meio, última data)
    const xLabels = t1 - t0 > 86400000 * 3 ? [t0, (t0 + t1) / 2, t1] : [t0, t1];
    xLabels.forEach((t, i) => {
      const label = el('text', {
        class: 'c-axis', x: sx(t), y: H - 6,
        'text-anchor': i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle',
      });
      label.textContent = new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      svg.appendChild(label);
    });

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.appendChild(tip);

    for (const s of series) {
      const pts = [...s.points].sort((a, b) => a.x.localeCompare(b.x));
      const coords = pts.map((p) => ({ ...p, cx: sx(new Date(p.x + 'T00:00:00').getTime()), cy: sy(p.y) }));

      if (coords.length > 1) {
        svg.appendChild(el('path', {
          class: 'c-line', stroke: s.color,
          d: coords.map((c, i) => `${i ? 'L' : 'M'}${c.cx.toFixed(1)} ${c.cy.toFixed(1)}`).join(' '),
        }));
      }

      for (const c of coords) {
        const dot = el('circle', { class: 'c-dot', cx: c.cx, cy: c.cy, r: coords.length > 24 ? 2.5 : 3.6, fill: s.color });
        svg.appendChild(dot);

        const hit = el('circle', { class: 'c-hit', cx: c.cx, cy: c.cy, r: 16 });
        const show = () => {
          tip.hidden = false;
          tip.textContent = `${fmtDate(c.x)} · ${fmt(c.y, dec)}${cfg.unit ? ' ' + cfg.unit : ''}${series.length > 1 ? ' · ' + s.label : ''}`;
          tip.style.left = `${Math.min(Math.max(c.cx, 46), W - 46)}px`;
          tip.style.top = `${c.cy - 10}px`;
        };
        hit.addEventListener('pointerenter', show);
        hit.addEventListener('pointerdown', show);
        hit.addEventListener('pointerleave', () => { tip.hidden = true; });
        svg.appendChild(hit);
      }
    }

    host.appendChild(svg);
    host.addEventListener('pointerleave', () => { tip.hidden = true; });

    if (series.length > 1) {
      const legend = document.createElement('div');
      legend.className = 'chart-legend';
      for (const s of series) {
        const item = document.createElement('span');
        const swatch = document.createElement('i');
        swatch.style.background = s.color;
        item.append(swatch, document.createTextNode(s.label));
        legend.appendChild(item);
      }
      host.appendChild(legend);
    }
  };

  draw();

  let raf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(draw);
  });
  ro.observe(host);
  host._cleanup = () => { ro.disconnect(); cancelAnimationFrame(raf); host._cleanup = null; };
}
