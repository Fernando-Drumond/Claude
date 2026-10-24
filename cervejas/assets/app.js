/* Controlador do app. */

import * as db from './db.js';
import {
  FACTORS, DESCRIPTORS, DESCRIPTOR_LEVELS, TAG_THRESHOLD, STYLES, VOLUMES,
  technicalScore, summarize, litersOf, fmtScore, fmtNum, todayISO, fmtDate, norm, scoreColor,
} from './score.js';
import { radarChart, barChart } from './charts.js';

const VERSION = '1.0.0';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const TITLES = { library: 'Biblioteca', add: 'Registrar', explore: 'Explorar', settings: 'Ajustes' };
const DUEL_COLORS = ['#f5b700', '#b4471c'];

const state = {
  beers: new Map(),
  entries: [],
  summaries: [],
  photoUrls: new Map(),   // beerId -> objectURL | null
  view: 'library',
  mode: 'beers',
  openBeerId: null,
  lastPick: null,
  backupFile: null,       // backup já gerado, aguardando novo toque para salvar
  form: null,
};

/* ══════════════ armazenamento local de preferências ══════════════ */
function pref(key, fallback = null) {
  try { const v = localStorage.getItem('cervejas.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function setPref(key, value) {
  try { localStorage.setItem('cervejas.' + key, JSON.stringify(value)); } catch { /* modo privado */ }
}

/* ══════════════ inicialização ══════════════ */

async function init() {
  buildStaticUi();
  bindEvents();
  startForm();
  await reload();
  setView(state.summaries.length ? 'library' : 'add');
  if (location.hash === '#add') setView('add');
  $('#versionInfo').textContent = `Versão ${VERSION} · dados armazenados apenas neste aparelho.`;
  updateStorageInfo();
  registerServiceWorker();
}

async function reload() {
  const [beers, entries] = await Promise.all([db.listBeers(), db.listEntries()]);
  state.beers = new Map(beers.map((b) => [b.id, b]));
  state.entries = entries;
  const byBeer = new Map(beers.map((b) => [b.id, []]));
  for (const e of entries) byBeer.get(e.beerId)?.push(e);
  state.summaries = beers.map((b) => summarize(b, byBeer.get(b.id)));
  refreshLists();
  renderLibrary();
  renderExplore();
  renderBackupInfo();
}

function summaryOf(id) { return state.summaries.find((s) => s.beer.id === id); }

/* ══════════════ navegação ══════════════ */

function setView(view) {
  state.view = view;
  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $('#topTitle').textContent = TITLES[view];
  window.scrollTo(0, 0);
}

function bindEvents() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    // Rascunho de registro novo é mantido ao trocar de aba; edição é descartada.
    if (t.dataset.view === 'add' && (state.form.entryId || state.form.beerOnly)) startForm();
    setView(t.dataset.view);
  }));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { if (go.dataset.goto === 'add') startForm(); setView(go.dataset.goto); }
    const open = e.target.closest('[data-beer]');
    if (open) openBeer(open.dataset.beer);
  });

  // biblioteca
  $('#q').addEventListener('input', renderLibrary);
  ['#fStyle', '#fTag', '#fMin', '#fSort'].forEach((s) => $(s).addEventListener('change', renderLibrary));
  $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    $$('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    renderLibrary();
  }));
  $('#clearFilters').addEventListener('click', () => {
    $('#q').value = ''; ['#fStyle', '#fTag', '#fMin'].forEach((s) => { $(s).value = ''; });
    renderLibrary();
  });

  // cadastro
  $('#addForm').addEventListener('submit', onSave);
  $('#photoInput').addEventListener('change', onPhotoPicked);
  $('#photoRemove').addEventListener('click', () => { state.form.photo = null; showPhoto(null); });
  $('#name').addEventListener('input', renderSuggestions);
  $('#name').addEventListener('blur', () => setTimeout(() => { $('#nameSuggest').hidden = true; }, 150));
  $('#detachBeer').addEventListener('click', () => { state.form.beerId = null; state.form.photo = undefined; showPhoto(null); $('#existingNote').hidden = true; });
  $('#qtyMinus').addEventListener('click', () => setQty(state.form.qty - 1));
  $('#qtyPlus').addEventListener('click', () => setQty(state.form.qty + 1));
  $('#volumeOther').addEventListener('input', () => { state.form.volumeMl = parseInt($('#volumeOther').value, 10) || null; updateVolumeTotal(); });
  $('#rateToggle').addEventListener('change', () => { $('#ratingBox').hidden = !$('#rateToggle').checked; });
  // touchend/pointerup cobrem o toque no controle sem arrastar (o valor inicial também é uma nota válida).
  ['input', 'pointerup', 'touchend'].forEach((ev) => $('#overall').addEventListener(ev, () => {
    state.form.overall = parseFloat($('#overall').value); renderOverall();
  }));
  $('#cancelAdd').addEventListener('click', () => { const id = state.form.beerId; startForm(); setView('library'); if (id) openBeer(id); });

  // detalhe
  $('#sheetClose').addEventListener('click', closeBeer);
  $('#sheetEdit').addEventListener('click', () => {
    const beer = state.beers.get(state.openBeerId);
    closeBeer(); startForm({ beer, beerOnly: true }); setView('add');
  });
  $('#photoViewer').addEventListener('click', () => { $('#photoViewer').hidden = true; });

  // explorar
  $('#pickBtn').addEventListener('click', renderPick);
  $('#rankBy').addEventListener('change', renderRanking);
  $('#rankStyle').addEventListener('change', renderRanking);
  $('#duelA').addEventListener('change', renderDuel);
  $('#duelB').addEventListener('change', renderDuel);
  $('#monthMetric').addEventListener('change', renderMonthChart);

  // ajustes
  $('#exportJson').addEventListener('click', onExportJson);
  $('#importJson').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', onImportJson);
  $('#exportCsv').addEventListener('click', onExportCsv);
  $('#wipe').addEventListener('click', onWipe);
}

/* ══════════════ elementos fixos ══════════════ */

function buildStaticUi() {
  $('#styleList').innerHTML = STYLES.map((s) => `<option value="${esc(s)}">`).join('');
  $('#fTag').insertAdjacentHTML('beforeend', DESCRIPTORS.map((d) => `<option value="${d.tag}">${d.tag}</option>`).join(''));
  $('#tagThreshold').textContent = fmtNum(TAG_THRESHOLD);

  $('#volumeChips').innerHTML = VOLUMES.map((v) => `<button type="button" class="chip" data-ml="${v.ml}">${v.label}</button>`).join('')
    + '<button type="button" class="chip" data-ml="other">Outro</button>';
  $$('#volumeChips .chip').forEach((c) => c.addEventListener('click', () => {
    if (c.dataset.ml === 'other') {
      setVolume(parseInt($('#volumeOther').value, 10) || null, true);
      $('#volumeOther').focus();
    } else setVolume(parseInt(c.dataset.ml, 10));
  }));

  $('#factorInputs').innerHTML = FACTORS.map((f) => `
    <div class="factor" data-factor="${f.key}">
      <div class="factor-head"><strong>${f.label}</strong><span>${f.hint} · peso ${Math.round(f.weight * 100)}%</span></div>
      <div class="scale">${[0, 1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}">${n}</button>`).join('')}</div>
      <div class="level"></div>
    </div>`).join('');
  $('#descriptorInputs').innerHTML = DESCRIPTORS.map((d) => `
    <div class="factor" data-desc="${d.key}">
      <div class="factor-head"><strong>${d.label}</strong><span class="desc-level"></span></div>
      <div class="scale desc">${[0, 1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}">${n}</button>`).join('')}</div>
    </div>`).join('');
  $$('#factorInputs .factor').forEach((row) => row.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const k = row.dataset.factor; const v = +b.dataset.v;
    state.form.factors[k] = state.form.factors[k] === v ? null : v;
    renderRatingInputs();
  }));
  $$('#descriptorInputs .factor').forEach((row) => row.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const k = row.dataset.desc; const v = +b.dataset.v;
    state.form.descriptors[k] = state.form.descriptors[k] === v ? null : v;
    renderRatingInputs();
  }));

  $('#scaleGuide').innerHTML = FACTORS.map((f) => `
    <details class="guide">
      <summary>${f.label} <span>${Math.round(f.weight * 100)}% · ${f.hint}</span></summary>
      <ol>${f.levels.map((l, i) => `<li><b>${i}</b>${esc(l)}</li>`).join('')}</ol>
    </details>`).join('');
}

/* Listas de sugestão (datalists e filtros) a partir dos dados existentes. */
function refreshLists() {
  const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const beers = [...state.beers.values()];
  $('#breweryList').innerHTML = uniq(beers.map((b) => b.brewery)).map((v) => `<option value="${esc(v)}">`).join('');
  $('#countryList').innerHTML = uniq(['Brasil', 'Alemanha', 'Bélgica', 'Estados Unidos', 'Reino Unido', 'República Tcheca', ...beers.map((b) => b.country)])
    .map((v) => `<option value="${esc(v)}">`).join('');
  $('#placeList').innerHTML = uniq(['Casa', ...state.entries.map((e) => e.place)]).map((v) => `<option value="${esc(v)}">`).join('');

  const styles = uniq(beers.map((b) => b.style));
  for (const sel of ['#fStyle', '#pickStyle', '#rankStyle']) {
    const cur = $(sel).value;
    const first = $(sel).options[0].outerHTML;
    $(sel).innerHTML = first + styles.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    $(sel).value = styles.includes(cur) ? cur : '';
  }
}

/* ══════════════ biblioteca ══════════════ */

function currentFilters() {
  return {
    q: norm($('#q').value),
    style: $('#fStyle').value,
    tag: $('#fTag').value,
    min: $('#fMin').value === '' ? null : parseFloat($('#fMin').value),
    sort: $('#fSort').value,
  };
}

function beerMatches(s, f) {
  if (f.style && s.beer.style !== f.style) return false;
  if (f.tag && !s.tags.includes(f.tag)) return false;
  if (f.min === -1 && s.subjective !== null) return false;
  if (f.min !== null && f.min >= 0 && (s.subjective === null || s.subjective < f.min)) return false;
  return true;
}

function textOf(s) {
  const b = s.beer;
  return norm([b.name, b.brewery, b.style, b.country, ...s.tags,
    ...s.entries.flatMap((e) => [e.place, e.rating?.notes])].join(' '));
}

function renderLibrary() {
  const f = currentFilters();
  const has = state.summaries.length > 0;
  $('#libraryEmpty').hidden = has;
  $$('.view[data-view=library] > :not(#libraryEmpty)').forEach((n) => { n.hidden = !has; });
  if (!has) return;

  $('#fSort').hidden = state.mode !== 'beers';
  $('#clearFilters').hidden = !(f.q || f.style || f.tag || f.min !== null);

  const terms = f.q.split(/\s+/).filter(Boolean);
  const matchText = (txt) => terms.every((t) => txt.includes(t));
  const list = $('#libraryList');

  if (state.mode === 'beers') {
    const rows = state.summaries.filter((s) => beerMatches(s, f) && matchText(textOf(s)));
    sortSummaries(rows, f.sort);
    $('#resultCount').textContent = `${rows.length} ${rows.length === 1 ? 'cerveja' : 'cervejas'}`;
    list.innerHTML = rows.map((s) => beerItem(s)).join('') || noResults();
  } else {
    const rows = [];
    for (const s of state.summaries) {
      if (!beerMatches(s, f)) continue;
      const base = norm([s.beer.name, s.beer.brewery, s.beer.style, s.beer.country, ...s.tags].join(' '));
      for (const e of s.entries) {
        if (matchText(base + ' ' + norm([e.place, e.rating?.notes].join(' ')))) rows.push({ s, e });
      }
    }
    rows.sort((a, b) => b.e.date.localeCompare(a.e.date) || b.e.createdAt - a.e.createdAt);
    $('#resultCount').textContent = `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`;
    let html = '';
    let month = '';
    for (const { s, e } of rows) {
      const m = e.date.slice(0, 7);
      if (m !== month) { month = m; html += `<div class="day-head">${monthName(m)}</div>`; }
      const sub = [fmtDate(e.date), e.place, `${e.qty}× ${e.volumeMl || '?'} ml`].filter(Boolean).join(' · ');
      html += beerItem(s, { sub, score: e.rating?.overall ?? null, extra: '' });
    }
    list.innerHTML = html || noResults();
  }
  hydratePhotos(list);
}

const noResults = () => '<p class="hint center">Nada encontrado com esses filtros.</p>';

function sortSummaries(rows, by) {
  const nullLast = (v) => (v === null ? -Infinity : v);
  const cmp = {
    recent: (a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''),
    subjective: (a, b) => nullLast(b.subjective) - nullLast(a.subjective),
    technical: (a, b) => nullLast(b.technical) - nullLast(a.technical),
    count: (a, b) => b.count - a.count,
    abv: (a, b) => nullLast(b.beer.abv) - nullLast(a.beer.abv),
    name: (a, b) => a.beer.name.localeCompare(b.beer.name, 'pt-BR'),
  }[by];
  rows.sort((a, b) => cmp(a, b) || a.beer.name.localeCompare(b.beer.name, 'pt-BR'));
}

/* Card de cerveja. opts.sub / opts.score substituem a linha secundária e a nota. */
function beerItem(s, opts = {}) {
  const b = s.beer;
  const sub = opts.sub ?? [b.brewery, b.style, b.abv ? fmtNum(b.abv) + '%' : ''].filter(Boolean).join(' · ');
  const score = 'score' in opts ? opts.score : s.subjective;
  const extra = opts.extra ?? (s.count > 1 ? `<span class="tag">${s.count}×</span>` : '');
  return `
    <button type="button" class="item" data-beer="${b.id}">
      <span class="thumb" data-photo="${b.id}">🍺</span>
      <span class="item-main">
        <span class="item-title">${esc(b.name)}</span>
        <span class="item-sub">${esc(sub)}</span>
        <span class="tags">${extra}${s.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</span>
      </span>
      <span class="badge${score === null ? ' none' : ''}" style="background:${scoreColor(score)}">${fmtScore(score)}</span>
    </button>`;
}

async function photoUrl(beerId) {
  if (!state.photoUrls.has(beerId)) {
    const blob = await db.getPhoto(beerId);
    state.photoUrls.set(beerId, blob ? URL.createObjectURL(blob) : null);
  }
  return state.photoUrls.get(beerId);
}

function forgetPhoto(beerId) {
  const url = state.photoUrls.get(beerId);
  if (url) URL.revokeObjectURL(url);
  state.photoUrls.delete(beerId);
}

function hydratePhotos(root) {
  $$('[data-photo]', root).forEach(async (n) => {
    const url = await photoUrl(n.dataset.photo);
    if (!url) return;
    const img = document.createElement('img');
    img.className = n.className; img.src = url; img.alt = '';
    n.replaceWith(img);
  });
}

/* ══════════════ detalhe da cerveja ══════════════ */

async function openBeer(id) {
  const s = summaryOf(id);
  if (!s) return;
  state.openBeerId = id;
  const b = s.beer;
  const url = await photoUrl(id);
  $('#sheetTitle').textContent = b.name;
  const rated = s.entries.some((e) => e.rating);
  const facts = [
    ['ABV', b.abv ? fmtNum(b.abv) + '%' : '—'],
    ['IBU', b.ibu ?? '—'],
    ['Unidades', s.count],
    ['Litros', fmtNum(s.liters, 2)],
    ['Primeira', fmtDate(s.entries[s.entries.length - 1]?.date) || '—'],
    ['Última', fmtDate(s.lastDate) || '—'],
  ];

  $('#sheetBody').innerHTML = `
    ${url ? `<img class="hero" src="${url}" alt="Foto de ${esc(b.name)}" id="heroImg">` : '<div class="hero placeholder">🍺</div>'}
    <h2 style="margin:0">${esc(b.name)}</h2>
    <p class="hint">${esc([b.brewery, b.style, b.country].filter(Boolean).join(' · '))}</p>
    <div class="tags" style="margin-bottom:12px">${s.tags.map((t) => `<span class="tag">${t}</span>`).join('')}</div>
    <div class="scores">
      <div class="score-box${s.subjective === null ? ' none' : ''}" style="background:${scoreColor(s.subjective)}"><span>Nota geral</span><b>${fmtScore(s.subjective)}</b></div>
      <div class="score-box${s.technical === null ? ' none' : ''}" style="background:${scoreColor(s.technical)}"><span>Nota técnica</span><b>${fmtScore(s.technical)}</b></div>
    </div>
    <button type="button" class="btn primary" id="againBtn" style="width:100%;margin-bottom:14px">🍺 Bebi de novo</button>
    <div class="card"><div class="facts">${facts.map(([k, v]) => `<div class="fact"><b>${esc(String(v))}</b><span>${k}</span></div>`).join('')}</div></div>
    ${rated ? `
      <div class="card"><h2>Fatores (média)</h2><div id="beerRadar"></div></div>
      ${DESCRIPTORS.some((d) => s.descriptors[d.key] !== null) ? `<div class="card"><h2>Perfil de sabor</h2>${descBars(s.descriptors)}</div>` : ''}` : ''}
    <div class="card">
      <h2>Histórico (${s.entries.length})</h2>
      ${s.entries.map(entryRow).join('')}
    </div>
    <button type="button" class="btn danger" id="deleteBeer" style="width:100%">Excluir cerveja e histórico</button>`;

  if (rated) $('#beerRadar').append(radarChart(FACTORS, [{ values: s.factors, color: '#e39b17' }]));
  $('#heroImg')?.addEventListener('click', () => { $('#photoViewer img').src = url; $('#photoViewer').hidden = false; });
  $('#againBtn').addEventListener('click', () => { closeBeer(); startForm({ beer: b }); setView('add'); });
  $('#deleteBeer').addEventListener('click', async () => {
    if (!confirm(`Excluir “${b.name}” e todos os ${s.entries.length} registros?`)) return;
    await db.deleteBeer(id); forgetPhoto(id); closeBeer(); await reload(); toast('Cerveja excluída');
  });
  $$('[data-edit-entry]', $('#sheetBody')).forEach((btn) => btn.addEventListener('click', () => {
    const entry = s.entries.find((e) => e.id === btn.dataset.editEntry);
    closeBeer(); startForm({ beer: b, entry }); setView('add');
  }));
  $$('[data-del-entry]', $('#sheetBody')).forEach((btn) => btn.addEventListener('click', async () => {
    if (s.entries.length === 1) {
      if (!confirm('É o único registro desta cerveja. Excluir a cerveja inteira?')) return;
      await db.deleteBeer(id); forgetPhoto(id); closeBeer(); await reload(); toast('Cerveja excluída');
      return;
    }
    if (!confirm('Excluir este registro?')) return;
    await db.deleteEntry(btn.dataset.delEntry); await reload(); openBeer(id); toast('Registro excluído');
  }));

  $('#sheet').hidden = false;
  $('#sheet').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closeBeer() {
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
  state.openBeerId = null;
}

function descBars(values) {
  return `<div class="desc-bars">${DESCRIPTORS.map((d) => {
    const v = values[d.key];
    return `<div class="desc-bar"><span>${d.label}</span>
      <span class="track"><span class="fill" style="width:${v === null ? 0 : (v / 5) * 100}%"></span></span>
      <em>${v === null ? '—' : fmtNum(v)}</em></div>`;
  }).join('')}</div>`;
}

function entryRow(e) {
  const r = e.rating;
  const tech = r ? technicalScore(r.factors) : null;
  const sub = [e.place, `${e.qty}× ${e.volumeMl || '?'} ml`, e.price ? fmtMoney(e.price) : ''].filter(Boolean).join(' · ');
  return `
    <div class="entry">
      <div class="entry-head"><span>${fmtDate(e.date)}</span>
        <span>${r ? `Geral ${fmtScore(r.overall)} · Técn. ${fmtScore(tech)}` : '<span class="hint">sem avaliação</span>'}</span></div>
      <div class="entry-sub">${esc(sub)}</div>
      ${r?.notes ? `<div class="entry-notes">${esc(r.notes)}</div>` : ''}
      <div class="entry-actions">
        <button type="button" class="link small" data-edit-entry="${e.id}">Editar</button>
        <button type="button" class="link small danger" data-del-entry="${e.id}">Excluir</button>
      </div>
    </div>`;
}

/* ══════════════ cadastro ══════════════ */

/* opts.beer: cerveja já existente; opts.entry: registro a editar; opts.beerOnly: editar só a cerveja. */
function startForm({ beer = null, entry = null, beerOnly = false } = {}) {
  const prevRated = beer ? summaryOf(beer.id)?.entries.some((e) => e.rating) : false;
  state.form = {
    beerId: beer?.id || null,
    entryId: entry?.id || null,
    beerOnly,
    photo: undefined,
    qty: entry?.qty ?? 1,
    volumeMl: entry?.volumeMl ?? pref('lastVolume', 350),
    overall: entry?.rating?.overall ?? null,
    factors: { ...(entry?.rating?.factors || {}) },
    descriptors: { ...(entry?.rating?.descriptors || {}) },
  };
  const form = $('#addForm');
  form.reset();
  $('#name').value = beer?.name || '';
  $('#brewery').value = beer?.brewery || '';
  $('#style').value = beer?.style || '';
  $('#abv').value = beer?.abv ? fmtNum(beer.abv) : '';
  $('#ibu').value = beer?.ibu ?? '';
  $('#country').value = beer?.country || '';
  $('#date').value = entry?.date || todayISO();
  $('#place').value = entry?.place || '';
  $('#price').value = entry?.price ? fmtMoney(entry.price).replace('R$', '').trim() : '';
  $('#notes').value = entry?.rating?.notes || '';
  $('#existingNote').hidden = !beer || beerOnly || !!entry;
  $('#nameSuggest').hidden = true;

  const rate = entry ? !!entry.rating : !prevRated;
  $('#rateToggle').checked = rate;
  $('#ratingBox').hidden = !rate;

  // Editar só a cerveja esconde consumo e avaliação.
  $$('#addForm > .card').forEach((c, i) => { if (i >= 2) c.hidden = beerOnly; });
  $('#cancelAdd').hidden = !(entry || beerOnly);
  TITLES.add = beerOnly ? 'Editar cerveja' : entry ? 'Editar registro' : beer ? 'Bebi de novo' : 'Registrar';
  $('#topTitle').textContent = TITLES.add;

  setQty(state.form.qty);
  const known = VOLUMES.some((v) => v.ml === state.form.volumeMl);
  if (!known) $('#volumeOther').value = state.form.volumeMl || '';
  setVolume(state.form.volumeMl, !known);
  renderOverall();
  renderRatingInputs();
  showPhoto(null);
  if (beer) photoUrl(beer.id).then((url) => { if (state.form.beerId === beer.id && state.form.photo === undefined) showPhoto(url); });
}

function setQty(n) {
  state.form.qty = Math.max(1, Math.min(99, n));
  $('#qty').textContent = state.form.qty;
  updateVolumeTotal();
}

function setVolume(ml, other = false) {
  state.form.volumeMl = ml;
  $$('#volumeChips .chip').forEach((c) => {
    c.classList.toggle('active', other ? c.dataset.ml === 'other' : +c.dataset.ml === ml);
  });
  $('#volumeOther').hidden = !other;
  updateVolumeTotal();
}

function updateVolumeTotal() {
  const f = state.form;
  $('#volumeTotal').textContent = f.volumeMl ? `Total: ${fmtNum((f.qty * f.volumeMl) / 1000, 2)} L` : '';
}

function renderOverall() {
  const v = state.form.overall;
  $('#overallOut').textContent = fmtScore(v);
  if (v !== null) $('#overall').value = v;
  $('#overallOut').style.color = v === null ? 'var(--muted)' : '';
}

function renderRatingInputs() {
  const f = state.form;
  $$('#factorInputs .factor').forEach((row) => {
    const factor = FACTORS.find((x) => x.key === row.dataset.factor);
    const v = f.factors[factor.key];
    $$('button', row).forEach((b) => b.classList.toggle('on', +b.dataset.v === v));
    $('.level', row).textContent = v === null || v === undefined ? '' : factor.levels[v];
  });
  $$('#descriptorInputs .factor').forEach((row) => {
    const v = f.descriptors[row.dataset.desc];
    $$('button', row).forEach((b) => b.classList.toggle('on', +b.dataset.v === v));
    $('.desc-level', row).textContent = v === null || v === undefined ? '' : DESCRIPTOR_LEVELS[v];
  });
  const tech = technicalScore(f.factors);
  const filled = FACTORS.filter((x) => typeof f.factors[x.key] === 'number').length;
  $('#techOut').textContent = tech === null ? `${filled}/6` : fmtScore(tech);
}

function renderSuggestions() {
  const box = $('#nameSuggest');
  const q = norm($('#name').value);
  if (state.form.beerId || state.form.beerOnly || q.length < 2) { box.hidden = true; return; }
  const hits = [...state.beers.values()]
    .filter((b) => norm(b.name + ' ' + (b.brewery || '')).includes(q))
    .slice(0, 5);
  box.innerHTML = hits.map((b) => `<button type="button" data-pick="${b.id}">${esc(b.name)}
    <small>${esc([b.brewery, b.style].filter(Boolean).join(' · '))}</small></button>`).join('');
  box.hidden = !hits.length;
  $$('[data-pick]', box).forEach((btn) => btn.addEventListener('click', () => attachBeer(state.beers.get(btn.dataset.pick))));
}

/* Usa uma cerveja já cadastrada, mantendo o que já foi preenchido no consumo/avaliação. */
function attachBeer(beer) {
  state.form.beerId = beer.id;
  $('#name').value = beer.name;
  $('#brewery').value = beer.brewery || '';
  $('#style').value = beer.style || '';
  $('#abv').value = beer.abv ? fmtNum(beer.abv) : '';
  $('#ibu').value = beer.ibu ?? '';
  $('#country').value = beer.country || '';
  $('#nameSuggest').hidden = true;
  $('#existingNote').hidden = false;
  photoUrl(beer.id).then((url) => { if (state.form.beerId === beer.id && state.form.photo === undefined) showPhoto(url); });
}

function showPhoto(url) {
  $('#photoPreview').hidden = !url;
  $('#photoEmpty').hidden = !!url;
  $('#photoRemove').hidden = !url;
  if (url) $('#photoPreview').src = url; else $('#photoPreview').removeAttribute('src');
}

async function onPhotoPicked(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const blob = await compressImage(file);
    state.form.photo = blob;
    showPhoto(URL.createObjectURL(blob));
  } catch {
    toast('Não foi possível ler essa foto.');
  }
}

/* Reduz para no máximo 1280 px e JPEG ~80% — uma foto fica em torno de 150–300 KB. */
function compressImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha'))), 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
    img.src = url;
  });
}

const parseDec = (s) => {
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

async function onSave(e) {
  e.preventDefault();
  const f = state.form;
  const name = $('#name').value.trim();
  if (!name) { toast('Informe o nome da cerveja'); $('#name').focus(); return; }

  // Mesmo nome e cervejaria de uma cerveja existente: oferece juntar ao histórico dela.
  let merged = false;
  if (!f.beerId && !f.beerOnly) {
    const twin = [...state.beers.values()].find((b) =>
      norm(b.name) === norm(name) && norm(b.brewery) === norm($('#brewery').value));
    if (twin && confirm(`“${twin.name}” já está na biblioteca. Adicionar este registro ao histórico dela?`)) {
      f.beerId = twin.id;
      merged = true;
    }
  }

  const old = f.beerId ? state.beers.get(f.beerId) : null;
  // Ao juntar com uma cerveja existente, campo deixado em branco não apaga o que já estava cadastrado.
  const keep = (v, k) => (merged && (v === '' || v === null) ? old[k] : v);
  const beer = {
    ...(old || {}),
    id: old?.id || db.uid(),
    name: merged ? old.name : name,
    brewery: merged ? old.brewery : $('#brewery').value.trim(),
    style: keep($('#style').value.trim(), 'style'),
    abv: keep(parseDec($('#abv').value), 'abv'),
    ibu: keep(parseDec($('#ibu').value), 'ibu'),
    country: keep($('#country').value.trim(), 'country'),
    createdAt: old?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  let entry = null;
  if (!f.beerOnly) {
    if (!f.volumeMl) { toast('Escolha a embalagem ou informe o volume'); return; }
    const oldEntry = f.entryId ? state.entries.find((x) => x.id === f.entryId) : null;
    let rating = null;
    if ($('#rateToggle').checked) {
      const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number'));
      rating = { overall: f.overall, factors: clean(f.factors), descriptors: clean(f.descriptors), notes: $('#notes').value.trim() };
      const empty = rating.overall === null && !Object.keys(rating.factors).length
        && !Object.keys(rating.descriptors).length && !rating.notes;
      if (empty) rating = null;
      else if (rating.overall === null && !confirm('Você não deu a nota geral (0–10). Salvar mesmo assim?')) return;
    }
    entry = {
      id: oldEntry?.id || db.uid(),
      beerId: beer.id,
      date: $('#date').value || todayISO(),
      place: $('#place').value.trim(),
      qty: f.qty,
      volumeMl: f.volumeMl,
      price: parseDec($('#price').value),
      rating,
      createdAt: oldEntry?.createdAt || Date.now(),
    };
    setPref('lastVolume', f.volumeMl);
  }

  try {
    await db.saveCheckin(beer, entry, f.photo);
  } catch (err) {
    toast('Erro ao salvar: ' + err.message);
    return;
  }
  if (f.photo !== undefined) forgetPhoto(beer.id);
  await reload();
  startForm();
  setView('library');
  openBeer(beer.id);
  toast(f.entryId || f.beerOnly ? 'Alterações salvas' : 'Saúde! 🍻 Registro salvo');
  requestPersistence();
}

/* ══════════════ explorar ══════════════ */

function renderExplore() {
  const has = state.summaries.length > 0;
  $('#exploreEmpty').hidden = has;
  $('#exploreContent').hidden = !has;
  if (!has) return;
  renderStats();
  renderRanking();
  renderDuelOptions();
  renderMonthChart();
  renderStyleTable();
  renderDivergence();
  $('#pickResult').innerHTML = '';
}

function renderStats() {
  const S = state.summaries;
  const units = S.reduce((n, s) => n + s.count, 0);
  const liters = S.reduce((n, s) => n + s.liters, 0);
  const styles = new Set(S.map((s) => s.beer.style).filter(Boolean)).size;
  const scored = S.map((s) => s.subjective).filter((v) => v !== null);
  const spent = state.entries.reduce((n, e) => n + (e.price || 0) * (e.qty || 0), 0);
  const month = todayISO().slice(0, 7);
  const monthLiters = state.entries.filter((e) => e.date.startsWith(month)).reduce((n, e) => n + litersOf(e), 0);
  const tiles = [
    [S.length, 'rótulos'],
    [units, 'unidades'],
    [fmtNum(liters, 1) + ' L', 'no total'],
    [fmtNum(monthLiters, 1) + ' L', 'este mês'],
    [styles, 'estilos'],
    [scored.length ? fmtScore(scored.reduce((a, b) => a + b, 0) / scored.length) : '—', 'nota média'],
  ];
  if (spent > 0) tiles.push(['R$ ' + fmtNum(spent, 0), 'gastos']);
  $('#statGrid').innerHTML = tiles.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
}

function renderPick() {
  const style = $('#pickStyle').value;
  const pool = state.summaries.filter((s) => s.subjective !== null && s.subjective >= 7.5 && (!style || s.beer.style === style));
  if (!pool.length) {
    $('#pickResult').innerHTML = '<p class="hint">Nenhuma cerveja com nota geral 7,5 ou mais nesse filtro.</p>';
    return;
  }
  const choices = pool.length > 1 ? pool.filter((s) => s.beer.id !== state.lastPick) : pool;
  const s = choices[Math.floor(Math.random() * choices.length)];
  state.lastPick = s.beer.id;
  $('#pickResult').innerHTML = `<div class="list">${beerItem(s)}</div>`;
  hydratePhotos($('#pickResult'));
}

function renderRanking() {
  const by = $('#rankBy').value;
  const style = $('#rankStyle').value;
  const rows = state.summaries.filter((s) => s[by] !== null && (!style || s.beer.style === style));
  rows.sort((a, b) => b[by] - a[by] || b.count - a.count);
  $('#rankList').innerHTML = rows.slice(0, 10).map((s) => `<li>${beerItem(s, { score: s[by] })}</li>`).join('')
    || '<p class="hint">Avalie algumas cervejas para montar o ranking.</p>';
  hydratePhotos($('#rankList'));
}

function renderDuelOptions() {
  const rated = state.summaries.filter((s) => s.entries.some((e) => e.rating))
    .sort((a, b) => a.beer.name.localeCompare(b.beer.name, 'pt-BR'));
  const opts = rated.map((s) => `<option value="${s.beer.id}">${esc(s.beer.name)}</option>`).join('');
  const [a, b] = [$('#duelA').value, $('#duelB').value];
  $('#duelA').innerHTML = opts; $('#duelB').innerHTML = opts;
  if (rated.length < 2) {
    $('#duelResult').innerHTML = '<p class="hint">Avalie pelo menos duas cervejas para colocá-las frente a frente.</p>';
    return;
  }
  const top = [...rated].sort((x, y) => (y.subjective ?? -1) - (x.subjective ?? -1));
  const ids = rated.map((s) => s.beer.id);
  $('#duelA').value = ids.includes(a) ? a : top[0].beer.id;
  $('#duelB').value = ids.includes(b) && b !== $('#duelA').value ? b : top.find((s) => s.beer.id !== $('#duelA').value).beer.id;
  renderDuel();
}

function renderDuel() {
  const A = summaryOf($('#duelA').value);
  const B = summaryOf($('#duelB').value);
  if (!A || !B) return;
  if (A === B) { $('#duelResult').innerHTML = '<p class="hint">Escolha duas cervejas diferentes.</p>'; return; }
  const row = (label, va, vb, fmt = fmtScore) => {
    const wa = va !== null && vb !== null && va > vb;
    const wb = va !== null && vb !== null && vb > va;
    return `<tr><td>${label}</td><td class="${wa ? 'win' : ''}">${fmt(va)}</td><td class="${wb ? 'win' : ''}">${fmt(vb)}</td></tr>`;
  };
  $('#duelResult').innerHTML = `
    <div class="duel-scores">
      <div><b style="color:${DUEL_COLORS[0]}">${fmtScore(A.subjective)}</b><div class="hint">geral</div></div>
      <span class="vs">VS</span>
      <div><b style="color:${DUEL_COLORS[1]}">${fmtScore(B.subjective)}</b><div class="hint">geral</div></div>
    </div>
    <div id="duelRadar"></div>
    <div class="legend">
      <span><i style="background:${DUEL_COLORS[0]}"></i>${esc(A.beer.name)}</span>
      <span><i style="background:${DUEL_COLORS[1]}"></i>${esc(B.beer.name)}</span>
    </div>
    <table class="table duel-table">
      <tr><th></th><th>${esc(A.beer.name)}</th><th>${esc(B.beer.name)}</th></tr>
      ${row('Nota técnica', A.technical, B.technical)}
      ${FACTORS.map((f) => row(f.label, A.factors[f.key], B.factors[f.key], (v) => fmtNum(v))).join('')}
      ${DESCRIPTORS.map((d) => `<tr><td>${d.label}</td><td>${fmtNum(A.descriptors[d.key])}</td><td>${fmtNum(B.descriptors[d.key])}</td></tr>`).join('')}
      <tr><td>ABV</td><td>${A.beer.abv ? fmtNum(A.beer.abv) + '%' : '—'}</td><td>${B.beer.abv ? fmtNum(B.beer.abv) + '%' : '—'}</td></tr>
      <tr><td>Unidades</td><td>${A.count}</td><td>${B.count}</td></tr>
    </table>`;
  $('#duelRadar').append(radarChart(FACTORS, [
    { values: A.factors, color: DUEL_COLORS[0] },
    { values: B.factors, color: DUEL_COLORS[1] },
  ]));
}

function renderMonthChart() {
  const metric = $('#monthMetric').value;
  const months = [];
  const d = new Date();
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  const firstMonth = new Map(state.summaries.map((s) => [s.beer.id, s.entries[s.entries.length - 1]?.date?.slice(0, 7)]));
  const data = months.map((m) => {
    const es = state.entries.filter((e) => e.date.startsWith(m));
    let value;
    if (metric === 'liters') value = es.reduce((n, e) => n + litersOf(e), 0);
    else if (metric === 'count') value = es.reduce((n, e) => n + (e.qty || 0), 0);
    else value = [...firstMonth.values()].filter((fm) => fm === m).length;
    return { label: monthName(m, true), value: Math.round(value * 10) / 10 };
  });
  $('#monthChart').replaceChildren(barChart(data));
}

function renderStyleTable() {
  const groups = new Map();
  for (const s of state.summaries) {
    const k = s.beer.style || 'Sem estilo';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const rows = [...groups.entries()].map(([style, ss]) => {
    const sc = ss.map((s) => s.subjective).filter((v) => v !== null);
    return { style, beers: ss.length, units: ss.reduce((n, s) => n + s.count, 0), avg: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null };
  }).sort((a, b) => b.units - a.units || (b.avg ?? -1) - (a.avg ?? -1));
  $('#styleTable').innerHTML = '<tr><th>Estilo</th><th>Rótulos</th><th>Unid.</th><th>Nota</th></tr>'
    + rows.map((r) => `<tr><td>${esc(r.style)}</td><td>${r.beers}</td><td>${r.units}</td><td>${fmtScore(r.avg)}</td></tr>`).join('');
}

function renderDivergence() {
  const rows = state.summaries.filter((s) => s.subjective !== null && s.technical !== null)
    .map((s) => ({ s, diff: s.subjective - s.technical }))
    .filter((r) => Math.abs(r.diff) >= 0.5)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 5);
  $('#divergeList').innerHTML = rows.map(({ s, diff }) => beerItem(s, {
    sub: `Geral ${fmtScore(s.subjective)} · Técnica ${fmtScore(s.technical)}`,
    extra: `<span class="tag">${diff > 0 ? 'gostou mais do que a técnica diz' : 'técnica melhor que o seu gosto'} (${diff > 0 ? '+' : ''}${fmtScore(diff)})</span>`,
  })).join('') || '<p class="hint">Sem diferenças relevantes ainda — avalie os seis fatores para comparar.</p>';
  hydratePhotos($('#divergeList'));
}

/* ══════════════ backup ══════════════ */

async function onExportJson() {
  try {
    if (!state.backupFile) {
      $('#exportJson').disabled = true;
      const data = await db.exportAll();
      const stamp = todayISO();
      state.backupFile = new File([JSON.stringify(data)], `cervejas-backup-${stamp}.json`, { type: 'application/json' });
    }
    await saveFile(state.backupFile);
    state.backupFile = null;
    setPref('lastBackup', Date.now());
    renderBackupInfo();
  } catch (err) {
    if (err.name === 'AbortError') { state.backupFile = null; return; }
    if (err.name === 'NotAllowedError') {
      // O iPhone exige um toque "fresco" para abrir o compartilhamento depois de gerar o arquivo.
      $('#exportJson').textContent = 'Backup pronto — toque para salvar';
      return;
    }
    toast('Erro no backup: ' + err.message);
  } finally {
    $('#exportJson').disabled = false;
    if (!state.backupFile) $('#exportJson').textContent = 'Fazer backup (com fotos)';
  }
}

/* No iPhone usa a folha de compartilhamento ("Salvar em Arquivos"); senão, download comum. */
async function saveFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: file.name });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function onImportJson(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const n = Array.isArray(data.beers) ? data.beers.length : 0;
    if (!confirm(`Restaurar backup com ${n} cervejas? Itens com o mesmo identificador serão substituídos; o resto é mantido.`)) return;
    const r = await db.importAll(data);
    state.photoUrls.forEach((url) => url && URL.revokeObjectURL(url));
    state.photoUrls.clear();
    await reload();
    toast(`Restaurado: ${r.beers} cervejas, ${r.entries} registros, ${r.photos} fotos`);
  } catch (err) {
    toast(err instanceof SyntaxError ? 'Arquivo inválido.' : err.message);
  }
}

async function onExportCsv() {
  const head = ['data', 'cerveja', 'cervejaria', 'estilo', 'abv', 'ibu', 'pais', 'local', 'quantidade', 'volume_ml', 'litros',
    'preco_unit', 'nota_geral', 'nota_tecnica', ...FACTORS.map((f) => f.key), ...DESCRIPTORS.map((d) => d.key), 'notas'];
  const num = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [...state.entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const b = state.beers.get(e.beerId) || {};
    const r = e.rating || {};
    return [e.date, b.name, b.brewery, b.style, num(b.abv), num(b.ibu), b.country, e.place, e.qty, e.volumeMl, num(litersOf(e)),
      num(e.price), num(r.overall), num(r.factors ? technicalScore(r.factors) : null),
      ...FACTORS.map((f) => num(r.factors?.[f.key])), ...DESCRIPTORS.map((d) => num(r.descriptors?.[d.key])), r.notes]
      .map((v) => cell(v)).join(';');
  });
  const csv = '﻿' + [head.join(';'), ...rows].join('\n');
  try {
    await saveFile(new File([csv], `cervejas-${todayISO()}.csv`, { type: 'text/csv' }));
  } catch (err) {
    if (err.name !== 'AbortError') toast('Erro ao exportar: ' + err.message);
  }
}

function renderBackupInfo() {
  const last = pref('lastBackup');
  $('#lastBackup').textContent = last
    ? `Último backup: ${new Date(last).toLocaleDateString('pt-BR')}.`
    : 'Nenhum backup feito ainda.';
}

async function onWipe() {
  if (!confirm('Apagar TODAS as cervejas, registros e fotos deste aparelho?')) return;
  if (!confirm('Tem certeza? Isso não pode ser desfeito (a não ser com um backup).')) return;
  await db.clearAll();
  state.photoUrls.clear();
  await reload();
  toast('Dados apagados');
}

async function requestPersistence() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* sem suporte */ }
  updateStorageInfo();
}

async function updateStorageInfo() {
  if (!navigator.storage?.estimate) return;
  try {
    const { usage } = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted?.();
    $('#storageInfo').textContent = `Espaço usado: ${fmtNum(usage / 1048576, 1)} MB${persisted ? ' · armazenamento protegido' : ''}.`;
  } catch { /* sem suporte */ }
}

/* ══════════════ utilidades ══════════════ */

const fmtMoney = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function monthName(ym, short = false) {
  const [y, m] = ym.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: short ? 'short' : 'long' }).replace('.', '');
  return short ? name : `${name[0].toUpperCase()}${name.slice(1)} de ${y}`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline não disponível */ });
}

init();
