/* Controlador do app. */

import * as db from './db.js';
import {
  CIRCS, FOLDS, POSES, METRICS, metricByKey,
  derive, fmt, fmtDate, todayISO, daysBetween, relativeDays, ageAt,
} from './calc.js';
import { lineChart } from './charts.js';

const VERSION = '1.0.0';
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  profiles: [],
  profile: null,
  measurements: [],
  view: 'home',
  photoDraft: {},      // pose -> { blob, url, photoId? }
  photoRemovals: [],   // ids de fotos a excluir ao salvar
};

/* ══════════════ inicialização ══════════════ */

async function init() {
  await applyStoredTheme();
  buildInputs();
  bindEvents();

  state.profiles = await db.listProfiles();
  if (!state.profiles.length) {
    const p = newProfile('Eu');
    await db.saveProfile(p);
    state.profiles = [p];
    await db.setSetting('activeProfile', p.id);
    setView('settings');
    toast('Comece preenchendo seu perfil 👇');
  }

  const savedId = await db.getSetting('activeProfile');
  state.profile = state.profiles.find((p) => p.id === savedId) || state.profiles[0];
  await loadProfileData();

  if (location.hash === '#measure') setView('measure'); // atalho do ícone instalado

  $('#versionInfo').textContent = `Versão ${VERSION} · dados armazenados apenas neste aparelho.`;
  updateStorageInfo();
  registerServiceWorker();
  startReminderLoop();
}

function newProfile(name) {
  return {
    id: db.uid(), name, sex: 'male', birthdate: '', height: null,
    color: ['#2f6bff', '#e0559a', '#17a673', '#e08b17', '#8a5cf6'][state.profiles.length % 5],
    reminder: { enabled: false, everyDays: 7, time: '07:00', lastNotified: 0 },
    createdAt: Date.now(),
  };
}

async function loadProfileData() {
  state.measurements = await db.listMeasurements(state.profile.id);
  renderProfileChip();
  renderMetricSelects();
  renderHome();
  renderCharts();
  renderHistory();
  fillProfileForm();
  renderProfileList();
}

/* ══════════════ navegação ══════════════ */

function setView(view) {
  state.view = view;
  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (view === 'charts') renderCharts();
}

function bindEvents() {
  $$('.tab').forEach((t) => t.addEventListener('click', () => {
    if (t.dataset.view === 'measure' && !$('#editingId').value) resetMeasureForm();
    setView(t.dataset.view);
  }));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) { resetMeasureForm(); setView(go.dataset.goto); }
  });

  $('#themeBtn').addEventListener('click', toggleTheme);
  $('#profileChip').addEventListener('click', toggleProfileMenu);

  $('#measureForm').addEventListener('submit', onSaveMeasurement);
  $('#cancelEdit').addEventListener('click', () => { resetMeasureForm(); setView('history'); });

  $('#homeMetric').addEventListener('change', renderHome);
  $('#deltaRange').addEventListener('change', renderHome);
  $('#chartMetric').addEventListener('change', renderCharts);
  $('#chartRange').addEventListener('change', renderCharts);
  $('#comparePeer').addEventListener('change', renderCharts);

  $('#profileForm').addEventListener('submit', onSaveProfile);
  $('#addProfile').addEventListener('click', onAddProfile);
  $('#deleteProfile').addEventListener('click', onDeleteProfile);

  $('#rEnabled').addEventListener('change', onReminderToggle);
  $('#rEvery').addEventListener('change', saveReminder);
  $('#rTime').addEventListener('change', saveReminder);
  $('#testNotif').addEventListener('click', testNotification);

  $('#exportJson').addEventListener('click', onExportJson);
  $('#importJson').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', onImportJson);
  $('#exportCsv').addEventListener('click', onExportCsv);

  $('#photoViewer').addEventListener('click', () => { $('#photoViewer').hidden = true; });
}

/* ══════════════ tema ══════════════ */

async function applyStoredTheme() {
  const saved = await db.getSetting('theme');
  if (saved) document.documentElement.dataset.theme = saved;
}
async function toggleTheme() {
  const current = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  await db.setSetting('theme', next);
}

/* ══════════════ perfis ══════════════ */

function renderProfileChip() {
  const p = state.profile;
  $('#profileName').textContent = p.name;
  const av = $('#profileAvatar');
  av.textContent = p.name.trim().slice(0, 2).toUpperCase() || '?';
  av.style.background = p.color;
}

function toggleProfileMenu() {
  const menu = $('#profileMenu');
  const chip = $('#profileChip');
  if (!menu.hidden) { menu.hidden = true; chip.setAttribute('aria-expanded', 'false'); return; }
  menu.innerHTML = '';
  for (const p of state.profiles) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(p.id === state.profile.id));
    b.innerHTML = `<span class="avatar" style="background:${escapeAttr(p.color)}">${escapeHtml(p.name.slice(0, 2).toUpperCase())}</span><span>${escapeHtml(p.name)}</span>`;
    b.addEventListener('click', async () => {
      state.profile = p;
      await db.setSetting('activeProfile', p.id);
      menu.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
      resetMeasureForm();
      await loadProfileData();
    });
    menu.appendChild(b);
  }
  menu.hidden = false;
  chip.setAttribute('aria-expanded', 'true');
}

function fillProfileForm() {
  const p = state.profile;
  $('#pId').value = p.id;
  $('#pName').value = p.name;
  $('#pSex').value = p.sex;
  $('#pBirth').value = p.birthdate || '';
  $('#pHeight').value = p.height ?? '';
  $('#pColor').value = p.color;
  const r = p.reminder || { enabled: false, everyDays: 7, time: '07:00' };
  $('#rEnabled').checked = !!r.enabled;
  $('#rEvery').value = String(r.everyDays);
  $('#rTime').value = r.time;
  $('#reminderConfig').hidden = !r.enabled;
  $('#deleteProfile').hidden = state.profiles.length < 2;
  renderReminderStatus();
}

async function onSaveProfile(e) {
  e.preventDefault();
  const p = state.profile;
  p.name = $('#pName').value.trim() || 'Sem nome';
  p.sex = $('#pSex').value;
  p.birthdate = $('#pBirth').value;
  p.height = parseNum($('#pHeight').value);
  p.color = $('#pColor').value;
  await db.saveProfile(p);
  state.profiles = await db.listProfiles();
  state.profile = state.profiles.find((x) => x.id === p.id);
  await loadProfileData();
  toast('Perfil salvo');
}

async function onAddProfile() {
  const p = newProfile(`Perfil ${state.profiles.length + 1}`);
  await db.saveProfile(p);
  state.profiles = await db.listProfiles();
  state.profile = p;
  await db.setSetting('activeProfile', p.id);
  await loadProfileData();
  setView('settings');
  $('#pName').focus();
  $('#pName').select();
  toast('Perfil criado — dê um nome a ele');
}

async function onDeleteProfile() {
  if (state.profiles.length < 2) return;
  const p = state.profile;
  const n = state.measurements.length;
  if (!confirm(`Excluir o perfil "${p.name}" e suas ${n} ${n === 1 ? 'medição' : 'medições'}? Não dá para desfazer.`)) return;
  await db.deleteProfile(p.id);
  state.profiles = await db.listProfiles();
  state.profile = state.profiles[0];
  await db.setSetting('activeProfile', state.profile.id);
  await loadProfileData();
  toast('Perfil excluído');
}

function renderProfileList() {
  const host = $('#profileList');
  host.innerHTML = '';
  for (const p of state.profiles) {
    const row = document.createElement('div');
    row.className = 'row';
    const age = ageAt(p.birthdate, todayISO());
    const meta = [age !== null ? `${age} anos` : null, p.height ? `${fmt(p.height, 0)} cm` : null]
      .filter(Boolean).join(' · ') || 'sem dados';
    row.innerHTML = `
      <span class="avatar" style="background:${escapeAttr(p.color)}">${escapeHtml(p.name.slice(0, 2).toUpperCase())}</span>
      <div><div style="font-weight:600">${escapeHtml(p.name)}</div><div class="meta">${escapeHtml(meta)}</div></div>`;
    if (p.id !== state.profile.id) {
      const btn = document.createElement('button');
      btn.className = 'btn small';
      btn.type = 'button';
      btn.textContent = 'Usar';
      btn.addEventListener('click', async () => {
        state.profile = p;
        await db.setSetting('activeProfile', p.id);
        resetMeasureForm();
        await loadProfileData();
        toast(`Perfil: ${p.name}`);
      });
      row.appendChild(btn);
    } else {
      const tag = document.createElement('span');
      tag.className = 'tag t-good';
      tag.style.marginLeft = 'auto';
      tag.textContent = 'ativo';
      row.appendChild(tag);
    }
    host.appendChild(row);
  }
}

/* ══════════════ formulário de medição ══════════════ */

function buildInputs() {
  $('#circInputs').innerHTML = CIRCS.map((c) => inputHtml(`circ-${c.key}`, c.label, 'cm', 0.1, 10, 250)).join('');
  $('#foldInputs').innerHTML = FOLDS.map((f) => inputHtml(`fold-${f.key}`, f.label, 'mm', 0.5, 1, 100)).join('');
  $('#photoSlots').innerHTML = POSES.map((p) => `
    <label class="photo-slot" data-pose="${p.key}">
      <span>${p.label}</span>
      <input type="file" accept="image/*" hidden>
    </label>`).join('');

  $$('#circInputs input, #foldInputs input').forEach((i) => {
    i.addEventListener('input', () => {
      i.closest('.field').classList.toggle('filled', i.value !== '');
      updateFilledCounts();
      renderBodyFatPreview();
    });
  });
  $$('.photo-slot').forEach((slot) => {
    slot.querySelector('input').addEventListener('change', (e) => onPickPhoto(slot, e.target.files[0]));
  });
  $('#mDate').value = todayISO();
}

function inputHtml(id, label, unit, step, min, max) {
  return `<label class="field">
    <span>${escapeHtml(label)} <em>${unit}</em></span>
    <input type="number" id="${id}" inputmode="decimal" step="${step}" min="${min}" max="${max}" placeholder="—">
  </label>`;
}

function updateFilledCounts() {
  const count = (sel) => $$(sel).filter((i) => i.value !== '').length;
  const c = count('#circInputs input'), f = count('#foldInputs input');
  $('[data-count="circ"]').textContent = c ? `${c}/${CIRCS.length}` : '';
  $('[data-count="fold"]').textContent = f ? `${f}/${FOLDS.length}` : '';
  const photos = Object.keys(state.photoDraft).length;
  $('#photoCount').textContent = photos ? `${photos}/3` : '';
}

function readForm() {
  const circ = {}, folds = {};
  for (const c of CIRCS) { const v = parseNum($(`#circ-${c.key}`).value); if (v !== null) circ[c.key] = v; }
  for (const f of FOLDS) { const v = parseNum($(`#fold-${f.key}`).value); if (v !== null) folds[f.key] = v; }
  return {
    date: $('#mDate').value,
    weight: parseNum($('#mWeight').value),
    circ, folds,
    notes: $('#mNotes').value.trim(),
  };
}

function renderBodyFatPreview() {
  const host = $('#bfPreview');
  const d = derive(readForm(), state.profile);
  if (d.bodyFat === null) {
    if (d.age === null && Object.keys(readForm().folds).length) {
      host.hidden = false;
      host.className = 'hint';
      host.textContent = 'Informe a data de nascimento no perfil para calcular o % de gordura.';
      return;
    }
    host.hidden = true;
    return;
  }
  host.hidden = false;
  host.className = 'banner ok';
  host.textContent = `≈ ${fmt(d.bodyFat)}% de gordura · ${d.bodyFatMethod}`;
}

async function onSaveMeasurement(e) {
  e.preventDefault();
  const data = readForm();
  if (!data.date) return toast('Informe a data');
  const hasAny = data.weight !== null || Object.keys(data.circ).length || Object.keys(data.folds).length
    || Object.keys(state.photoDraft).length;
  if (!hasAny) return toast('Preencha ao menos um valor');

  const editingId = $('#editingId').value;
  const record = {
    id: editingId || db.uid(),
    profileId: state.profile.id,
    ...data,
    createdAt: editingId ? (state.measurements.find((m) => m.id === editingId)?.createdAt ?? Date.now()) : Date.now(),
    updatedAt: Date.now(),
  };
  await db.saveMeasurement(record);

  for (const id of state.photoRemovals) await db.deletePhoto(id);
  for (const [pose, item] of Object.entries(state.photoDraft)) {
    if (item.saved) continue;
    await db.savePhoto({
      id: item.photoId || db.uid(), measurementId: record.id, profileId: state.profile.id,
      pose, blob: item.blob, createdAt: Date.now(),
    });
  }

  resetMeasureForm();
  await loadProfileData();
  setView('home');
  toast(editingId ? 'Medição atualizada' : 'Medição salva ✓');
}

function resetMeasureForm() {
  $('#measureForm').reset();
  $('#editingId').value = '';
  $('#mDate').value = todayISO();
  $('#measureTitle').textContent = 'Nova medição';
  $('#cancelEdit').hidden = true;
  $$('#circInputs .field, #foldInputs .field').forEach((f) => f.classList.remove('filled'));
  Object.values(state.photoDraft).forEach((p) => p.url && URL.revokeObjectURL(p.url));
  state.photoDraft = {};
  state.photoRemovals = [];
  renderPhotoSlots();
  updateFilledCounts();
  $('#bfPreview').hidden = true;
}

async function editMeasurement(id) {
  const m = state.measurements.find((x) => x.id === id);
  if (!m) return;
  resetMeasureForm();
  $('#editingId').value = m.id;
  $('#measureTitle').textContent = 'Editar medição';
  $('#cancelEdit').hidden = false;
  $('#mDate').value = m.date;
  $('#mWeight').value = m.weight ?? '';
  $('#mNotes').value = m.notes || '';
  for (const c of CIRCS) $(`#circ-${c.key}`).value = m.circ?.[c.key] ?? '';
  for (const f of FOLDS) $(`#fold-${f.key}`).value = m.folds?.[f.key] ?? '';
  $$('#circInputs input, #foldInputs input').forEach((i) => i.closest('.field').classList.toggle('filled', i.value !== ''));

  for (const photo of await db.listPhotos(m.id)) {
    state.photoDraft[photo.pose] = { blob: photo.blob, url: URL.createObjectURL(photo.blob), photoId: photo.id, saved: true };
  }
  renderPhotoSlots();
  updateFilledCounts();
  renderBodyFatPreview();
  $$('details.group').forEach((d) => { d.open = true; });
  setView('measure');
}

/* ══════════════ fotos ══════════════ */

async function onPickPhoto(slot, file) {
  if (!file) return;
  try {
    const blob = await compressImage(file);
    const pose = slot.dataset.pose;
    const prev = state.photoDraft[pose];
    if (prev) {
      if (prev.url) URL.revokeObjectURL(prev.url);
      if (prev.photoId && prev.saved) state.photoRemovals.push(prev.photoId);
    }
    state.photoDraft[pose] = { blob, url: URL.createObjectURL(blob) };
    renderPhotoSlots();
    updateFilledCounts();
  } catch {
    toast('Não foi possível ler a imagem');
  }
}

function renderPhotoSlots() {
  for (const slot of $$('.photo-slot')) {
    const pose = slot.dataset.pose;
    const item = state.photoDraft[pose];
    const label = POSES.find((p) => p.key === pose).label;
    slot.querySelectorAll('img, .rm').forEach((n) => n.remove());
    slot.classList.toggle('has', !!item);
    slot.querySelector('span').textContent = item ? '' : label;
    if (item) {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = label;
      slot.appendChild(img);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rm';
      rm.textContent = '✕';
      rm.setAttribute('aria-label', `Remover foto ${label}`);
      rm.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (item.url) URL.revokeObjectURL(item.url);
        if (item.photoId && item.saved) state.photoRemovals.push(item.photoId);
        delete state.photoDraft[pose];
        renderPhotoSlots();
        updateFilledCounts();
      });
      slot.appendChild(rm);
    }
    slot.querySelector('input').value = '';
  }
}

/* Reduz para no máximo 1280px e recomprime em JPEG — fotos de celular ocupariam MBs. */
async function compressImage(file, maxSide = 1280, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha ao comprimir'))), 'image/jpeg', quality);
  });
}

function openPhoto(url, alt) {
  const viewer = $('#photoViewer');
  const img = viewer.querySelector('img');
  img.src = url;
  img.alt = alt;
  viewer.hidden = false;
}

/* ══════════════ início ══════════════ */

function renderMetricSelects() {
  const available = METRICS.filter((metric) => seriesFor(state.measurements, metric).length > 0);
  const list = available.length ? available : METRICS.slice(0, 5);
  const options = (selected) => {
    let html = '', group = null;
    for (const m of list) {
      if (m.group !== group) {
        if (group) html += '</optgroup>';
        group = m.group;
        if (group) html += `<optgroup label="${escapeAttr(group)}">`;
      }
      html += `<option value="${m.key}"${m.key === selected ? ' selected' : ''}>${escapeHtml(m.label)}</option>`;
    }
    return html + (group ? '</optgroup>' : '');
  };
  const keep = (sel, fallback) => (list.some((m) => m.key === sel) ? sel : (list.some((m) => m.key === fallback) ? fallback : list[0].key));
  $('#homeMetric').innerHTML = options(keep($('#homeMetric').value, 'weight'));
  $('#chartMetric').innerHTML = options(keep($('#chartMetric').value, 'weight'));

  const peers = state.profiles.filter((p) => p.id !== state.profile.id);
  const current = $('#comparePeer').value;
  $('#comparePeer').innerHTML = '<option value="">— ninguém —</option>'
    + peers.map((p) => `<option value="${p.id}"${p.id === current ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
}

function seriesFor(measurements, metric, profile = state.profile) {
  return measurements
    .map((m) => ({ x: m.date, y: metric.get(m, derive(m, profile)) }))
    .filter((p) => typeof p.y === 'number' && isFinite(p.y));
}

function renderHome() {
  const has = state.measurements.length > 0;
  $('#homeEmpty').hidden = has;
  $('#homeContent').hidden = !has;
  renderReminderBanner();
  if (!has) return;

  const last = state.measurements[state.measurements.length - 1];
  const d = derive(last, state.profile);
  const days = daysBetween(last.date, todayISO());
  $('#lastUpdate').textContent = `Última medição: ${fmtDate(last.date, 'long')} (${relativeDays(days)})`;

  /* cartões */
  const prev = state.measurements[state.measurements.length - 2];
  const dPrev = prev ? derive(prev, state.profile) : null;
  const cards = [
    { label: 'Peso', value: d.weight, unit: 'kg', dec: 1, prev: dPrev?.weight, inverse: true },
    { label: 'Gordura', value: d.bodyFat, unit: '%', dec: 1, prev: dPrev?.bodyFat, inverse: true },
    { label: 'Massa magra', value: d.leanMass, unit: 'kg', dec: 1, prev: dPrev?.leanMass },
    { label: 'Cintura', value: last.circ?.waist ?? null, unit: 'cm', dec: 1, prev: prev?.circ?.waist ?? null, inverse: true },
  ];
  $('#statGrid').innerHTML = cards.map((c) => {
    const diff = c.value !== null && c.prev !== null && c.prev !== undefined ? c.value - c.prev : null;
    const dir = diff === null ? '' : diff > 0.05 ? 'up' : diff < -0.05 ? 'down' : 'flat';
    const sub = diff === null ? '&nbsp;'
      : `${diff > 0 ? '↑' : diff < 0 ? '↓' : '='} ${fmt(Math.abs(diff), c.dec)} ${c.unit}`;
    return `<div class="stat">
      <div class="label">${c.label}</div>
      <div class="value">${fmt(c.value, c.dec)}${c.value !== null ? `<small>${c.unit}</small>` : ''}</div>
      <div class="sub ${dir}${toneClass(c.inverse)}">${sub}</div>
    </div>`;
  }).join('');

  /* gráfico */
  const metric = metricByKey($('#homeMetric').value) || METRICS[0];
  lineChart($('#homeChart'), {
    unit: metric.unit,
    ariaLabel: `Evolução de ${metric.label}`,
    series: [{ label: state.profile.name, color: state.profile.color, points: seriesFor(state.measurements, metric) }],
    emptyNote: `Ainda não há registros de ${metric.label.toLowerCase()}.`,
  });

  renderIndices(d);
  renderDeltas();
}

function renderIndices(d) {
  const rows = [];
  const add = (k, v, cls) => rows.push({ k, v, cls });
  if (d.bmi !== null) add('IMC', fmt(d.bmi), d.bmiClass);
  if (d.bodyFat !== null) add('% de gordura', fmt(d.bodyFat) + '%', d.bodyFatClass);
  if (d.fatMass !== null) add('Massa gorda', fmt(d.fatMass) + ' kg', null);
  if (d.leanMass !== null) add('Massa magra', fmt(d.leanMass) + ' kg', null);
  if (d.whr !== null) add('Cintura / quadril', fmt(d.whr, 2), d.whrClass);
  if (d.whtr !== null) add('Cintura / altura', fmt(d.whtr, 2), d.whtrClass);
  if (d.bmr !== null) add('Metabolismo basal', `${fmt(d.bmr, 0)} kcal/dia`, { label: d.bmrMethod, tone: 'neutral' });
  if (d.idealWeight) add('Faixa de peso (IMC)', `${fmt(d.idealWeight[0], 1)}–${fmt(d.idealWeight[1], 1)} kg`, null);

  $('#indicesCard').hidden = rows.length === 0;
  $('#indexList').innerHTML = rows.map((r) => `
    <div class="index-row">
      <span class="k">${escapeHtml(r.k)}</span>
      ${r.cls ? `<span class="tag ${r.cls.tone === 'neutral' ? '' : 't-' + r.cls.tone}">${escapeHtml(r.cls.label)}</span>` : ''}
      <span class="v">${r.v}</span>
    </div>`).join('');

  if (d.bodyFat === null && !$('#indicesCard').hidden) {
    $('#indexList').insertAdjacentHTML('beforeend',
      '<p class="hint" style="margin-top:10px">Registre as dobras cutâneas para estimar % de gordura, massa magra e gorda.</p>');
  }
}

function renderDeltas() {
  const range = $('#deltaRange').value;
  const list = state.measurements;
  const last = list[list.length - 1];
  let base = null;
  if (range === 'prev') base = list[list.length - 2] || null;
  else if (range === 'first') base = list.length > 1 ? list[0] : null;
  else {
    const cutoff = daysBetween('1970-01-01', last.date) - Number(range);
    const older = list.filter((m) => daysBetween('1970-01-01', m.date) <= cutoff);
    base = older[older.length - 1] || null;
  }

  if (!base || base.id === last.id) {
    $('#deltaList').innerHTML = '<p class="hint">Sem uma medição anterior nesse intervalo para comparar.</p>';
    return;
  }

  const dLast = derive(last, state.profile), dBase = derive(base, state.profile);
  const span = daysBetween(base.date, last.date);
  const rows = [];
  for (const metric of METRICS) {
    const a = metric.get(base, dBase), b = metric.get(last, dLast);
    if (typeof a !== 'number' || typeof b !== 'number' || !isFinite(a) || !isFinite(b)) continue;
    const diff = b - a;
    if (Math.abs(diff) < 0.005) continue;
    rows.push({ key: metric.key, label: metric.label, diff, unit: metric.unit, inverse: metric.inverse });
  }

  /* As que interessam primeiro; o resto fica recolhido para a lista não virar um paredão. */
  const primary = HIGHLIGHT.map((k) => rows.find((r) => r.key === k)).filter(Boolean);
  const rest = rows.filter((r) => !primary.includes(r)).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const row = (r) => {
    const dir = r.diff > 0 ? 'up' : 'down';
    const dec = r.unit === '' ? 2 : 1;
    return `<div class="delta-row">
      <span class="k">${escapeHtml(r.label)}</span>
      <span class="v ${dir}${toneClass(r.inverse)}">${r.diff > 0 ? '+' : '−'}${fmt(Math.abs(r.diff), dec)}<small>${r.unit}</small></span>
    </div>`;
  };

  const header = `<p class="hint" style="margin-bottom:6px">${fmtDate(base.date)} → ${fmtDate(last.date)} · ${span} dias</p>`;
  $('#deltaList').innerHTML = header + (rows.length
    ? primary.map(row).join('')
      + (rest.length
        ? `<details class="more"><summary>Mais ${rest.length} ${rest.length === 1 ? 'medida' : 'medidas'}</summary>${rest.map(row).join('')}</details>`
        : '')
    : '<p class="hint">Nada mudou de forma mensurável nesse intervalo.</p>');
}

/* Ordem de destaque na lista de variação. */
const HIGHLIGHT = ['weight', 'bodyFat', 'fatMass', 'leanMass', 'circ.waist', 'circ.abdomen', 'circ.hip', 'bmi'];

/* Sobe é ruim por padrão (peso, gordura, cintura); `inv` inverte para as métricas em que subir é bom. */
const toneClass = (inverse) => (inverse ? '' : ' inv');

/* ══════════════ gráficos ══════════════ */

async function renderCharts() {
  const metric = metricByKey($('#chartMetric').value) || METRICS[0];
  const range = $('#chartRange').value;
  const cutoffDate = range === 'all' ? null : isoDaysAgo(Number(range));
  const inRange = (list) => (cutoffDate ? list.filter((m) => m.date >= cutoffDate) : list);

  const mine = seriesFor(inRange(state.measurements), metric);
  const series = [{ label: state.profile.name, color: state.profile.color, points: mine }];

  const peerId = $('#comparePeer').value;
  if (peerId) {
    const peer = state.profiles.find((p) => p.id === peerId);
    if (peer) {
      const peerMeasurements = await db.listMeasurements(peer.id);
      series.push({
        label: peer.name, color: peer.color,
        points: seriesFor(inRange(peerMeasurements), metric, peer),
      });
    }
  }

  lineChart($('#mainChart'), {
    unit: metric.unit,
    ariaLabel: `Evolução de ${metric.label}`,
    series,
    emptyNote: `Sem registros de ${metric.label.toLowerCase()} no período.`,
  });

  /* resumo */
  const host = $('#chartSummary');
  if (mine.length < 1) {
    host.innerHTML = '<p class="hint">Sem dados no período.</p>';
    return;
  }
  const values = mine.map((p) => p.y);
  const first = mine[0], last = mine[mine.length - 1];
  const diff = last.y - first.y;
  const dec = metric.unit === '' ? 2 : 1;
  const spanDays = daysBetween(first.x, last.x);
  const perMonth = spanDays >= 7 ? (diff / spanDays) * 30 : null;
  const boxes = [
    ['Atual', `${fmt(last.y, dec)} ${metric.unit}`],
    ['Variação', `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${fmt(Math.abs(diff), dec)} ${metric.unit}`],
    ['Mínimo', `${fmt(Math.min(...values), dec)} ${metric.unit}`],
    ['Máximo', `${fmt(Math.max(...values), dec)} ${metric.unit}`],
    ['Média', `${fmt(values.reduce((a, b) => a + b, 0) / values.length, dec)} ${metric.unit}`],
    ['Registros', String(mine.length)],
  ];
  if (perMonth !== null) boxes.push(['Ritmo', `${perMonth > 0 ? '+' : '−'}${fmt(Math.abs(perMonth), dec)} ${metric.unit}/mês`]);
  host.innerHTML = boxes.map(([k, v]) => `<div class="box"><div class="k">${escapeHtml(k)}</div><div class="v">${v.trim()}</div></div>`).join('');
}

/* ══════════════ histórico ══════════════ */

function renderHistory() {
  const host = $('#historyList');
  host.innerHTML = '';
  if (!state.measurements.length) {
    host.innerHTML = '<div class="empty"><p>Nenhuma medição registrada ainda.</p></div>';
    return;
  }

  for (const m of [...state.measurements].reverse()) {
    const d = derive(m, state.profile);
    const item = document.createElement('details');
    item.className = 'h-item';

    const filled = Object.keys(m.circ || {}).length + Object.keys(m.folds || {}).length + (m.weight !== null ? 1 : 0);
    const summary = document.createElement('summary');
    summary.innerHTML = `
      <div>
        <div class="h-date">${fmtDate(m.date, 'long')}</div>
        <div class="h-sub">${filled} ${filled === 1 ? 'valor' : 'valores'}${d.bodyFat !== null ? ` · ${fmt(d.bodyFat)}% gordura` : ''}</div>
      </div>
      <div class="h-main">${m.weight !== null ? fmt(m.weight) : '—'}<small>kg</small></div>`;
    item.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'h-body';
    const circRows = CIRCS.filter((c) => m.circ?.[c.key] != null)
      .map((c) => kv(c.label, `${fmt(m.circ[c.key])} cm`)).join('');
    const foldRows = FOLDS.filter((f) => m.folds?.[f.key] != null)
      .map((f) => kv(f.label, `${fmt(m.folds[f.key])} mm`)).join('');
    const idxRows = [
      d.bmi !== null ? kv('IMC', fmt(d.bmi)) : '',
      d.bodyFat !== null ? kv('% gordura', fmt(d.bodyFat) + '%') : '',
      d.leanMass !== null ? kv('Massa magra', fmt(d.leanMass) + ' kg') : '',
      d.fatMass !== null ? kv('Massa gorda', fmt(d.fatMass) + ' kg') : '',
      d.whr !== null ? kv('Cintura/quadril', fmt(d.whr, 2)) : '',
      d.bmr !== null ? kv('Metabolismo', fmt(d.bmr, 0) + ' kcal') : '',
    ].join('');

    body.innerHTML =
      (idxRows ? `<h3>Índices</h3><div class="kv-grid">${idxRows}</div>` : '') +
      (circRows ? `<h3>Circunferências</h3><div class="kv-grid">${circRows}</div>` : '') +
      (foldRows ? `<h3>Dobras cutâneas</h3><div class="kv-grid">${foldRows}</div>` : '') +
      (m.notes ? `<div class="h-notes">${escapeHtml(m.notes)}</div>` : '');

    const actions = document.createElement('div');
    actions.className = 'h-actions';
    const edit = document.createElement('button');
    edit.className = 'btn small';
    edit.type = 'button';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => editMeasurement(m.id));
    const remove = document.createElement('button');
    remove.className = 'btn small danger ghost';
    remove.type = 'button';
    remove.textContent = 'Excluir';
    remove.addEventListener('click', async () => {
      if (!confirm(`Excluir a medição de ${fmtDate(m.date, 'long')}?`)) return;
      await db.deleteMeasurement(m.id);
      await loadProfileData();
      toast('Medição excluída');
    });
    actions.append(edit, remove);
    body.appendChild(actions);
    item.appendChild(body);

    /* fotos carregadas apenas ao abrir o item */
    item.addEventListener('toggle', async () => {
      if (!item.open || item.dataset.photosLoaded) return;
      item.dataset.photosLoaded = '1';
      const photos = await db.listPhotos(m.id);
      if (!photos.length) return;
      const strip = document.createElement('div');
      strip.className = 'photo-strip';
      for (const photo of photos) {
        const url = URL.createObjectURL(photo.blob);
        const img = document.createElement('img');
        img.src = url;
        img.alt = POSES.find((p) => p.key === photo.pose)?.label || 'Foto';
        img.addEventListener('click', () => openPhoto(url, img.alt));
        strip.appendChild(img);
      }
      const heading = document.createElement('h3');
      heading.textContent = 'Fotos';
      body.insertBefore(heading, actions);
      body.insertBefore(strip, actions);
    });

    host.appendChild(item);
  }
}

const kv = (k, v) => `<div class="kv"><span>${escapeHtml(k)}</span><span>${v}</span></div>`;

/* ══════════════ lembretes ══════════════ */

function nextDue(profile, measurements) {
  const r = profile.reminder;
  if (!r?.enabled) return null;
  const last = measurements.length ? measurements[measurements.length - 1].date : todayISO(new Date(profile.createdAt));
  const [hh, mm] = (r.time || '07:00').split(':').map(Number);
  const due = new Date(last + 'T00:00:00');
  due.setDate(due.getDate() + Number(r.everyDays));
  due.setHours(hh || 0, mm || 0, 0, 0);
  return due;
}

function renderReminderBanner() {
  const banner = $('#reminderBanner');
  const due = nextDue(state.profile, state.measurements);
  if (!due) { banner.hidden = true; return; }

  const now = new Date();
  banner.hidden = false;
  if (now >= due) {
    const lateDays = Math.floor((now - due) / 86400000);
    banner.className = 'banner';
    banner.innerHTML = `<span>📏 Medição pendente${lateDays >= 1 ? ` há ${lateDays} ${lateDays === 1 ? 'dia' : 'dias'}` : ' hoje'}.</span>`;
    const btn = document.createElement('button');
    btn.className = 'btn small primary';
    btn.type = 'button';
    btn.textContent = 'Medir agora';
    btn.addEventListener('click', () => { resetMeasureForm(); setView('measure'); });
    banner.appendChild(btn);
  } else {
    const inDays = Math.ceil((due - now) / 86400000);
    banner.className = 'banner ok';
    banner.innerHTML = `<span>✅ Em dia. Próxima medição ${inDays <= 1 ? 'amanhã' : `em ${inDays} dias`} (${fmtDate(todayISO(due))}).</span>`;
  }
}

function renderReminderStatus() {
  const due = nextDue(state.profile, state.measurements);
  const status = $('#reminderStatus');
  if (!due) { status.textContent = ''; return; }
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const when = due.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const permNote = perm === 'granted'
    ? 'Notificações permitidas — o aviso aparece quando o app estiver aberto ou instalado na tela inicial.'
    : perm === 'denied'
      ? 'Notificações bloqueadas no navegador; o aviso continua aparecendo dentro do app.'
      : 'Ative as notificações para receber o aviso no celular.';
  status.textContent = `Próximo lembrete: ${when}. ${permNote}`;
}

async function onReminderToggle(e) {
  const on = e.target.checked;
  $('#reminderConfig').hidden = !on;
  if (on && 'Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* usuário recusou o diálogo */ }
  }
  await saveReminder();
}

async function saveReminder() {
  state.profile.reminder = {
    enabled: $('#rEnabled').checked,
    everyDays: Number($('#rEvery').value),
    time: $('#rTime').value || '07:00',
    lastNotified: state.profile.reminder?.lastNotified || 0,
  };
  await db.saveProfile(state.profile);
  renderReminderStatus();
  renderReminderBanner();
}

async function testNotification() {
  if (!('Notification' in window)) return toast('Este navegador não suporta notificações');
  if (Notification.permission !== 'granted') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Permissão de notificação negada');
  }
  await showNotification('Hora de medir 📏', `${state.profile.name}, é dia de registrar as medidas.`);
  toast('Notificação enviada');
}

async function showNotification(title, body) {
  const options = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'corpo-lembrete', renotify: true };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) return reg.showNotification(title, options);
  } catch { /* sem service worker disponível */ }
  new Notification(title, options);
}

/* Verifica a cada minuto enquanto o app estiver aberto. */
function startReminderLoop() {
  const check = async () => {
    for (const profile of state.profiles) {
      const due = nextDue(profile, profile.id === state.profile.id
        ? state.measurements
        : await db.listMeasurements(profile.id));
      if (!due) continue;
      const dueTime = due.getTime();
      if (Date.now() >= dueTime && (profile.reminder.lastNotified || 0) < dueTime) {
        profile.reminder.lastNotified = Date.now();
        await db.saveProfile(profile);
        if ('Notification' in window && Notification.permission === 'granted') {
          await showNotification('Hora de medir 📏', `${profile.name}, é dia de registrar as medidas.`);
        }
      }
    }
    renderReminderBanner();
  };
  check();
  setInterval(check, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

/* ══════════════ backup ══════════════ */

async function onExportJson() {
  const data = await db.exportAll();
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }),
    `corpo-backup-${todayISO()}.json`);
  toast('Backup exportado');
}

async function onImportJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  try {
    const data = JSON.parse(await file.text());
    const replace = confirm(
      'OK = substituir tudo pelo backup (apaga os dados atuais).\n' +
      'Cancelar = mesclar o backup com os dados atuais.'
    );
    const counts = await db.importAll(data, { replace });
    state.profiles = await db.listProfiles();
    state.profile = state.profiles.find((p) => p.id === state.profile?.id) || state.profiles[0];
    await db.setSetting('activeProfile', state.profile.id);
    await loadProfileData();
    toast(`Importado: ${counts.profiles} perfis, ${counts.measurements} medições`);
  } catch (err) {
    toast(err.message || 'Não foi possível importar o arquivo');
  }
}

function onExportCsv() {
  if (!state.measurements.length) return toast('Nada para exportar');
  const cols = [
    ['data', (m) => m.date],
    ['peso_kg', (m) => m.weight],
    ...CIRCS.map((c) => [`circ_${c.key}_cm`, (m) => m.circ?.[c.key]]),
    ...FOLDS.map((f) => [`dobra_${f.key}_mm`, (m) => m.folds?.[f.key]]),
    ['imc', (m, d) => d.bmi],
    ['gordura_pct', (m, d) => d.bodyFat],
    ['massa_gorda_kg', (m, d) => d.fatMass],
    ['massa_magra_kg', (m, d) => d.leanMass],
    ['cintura_quadril', (m, d) => d.whr],
    ['tmb_kcal', (m, d) => d.bmr],
    ['observacoes', (m) => m.notes],
  ];
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
    return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [cols.map(([h]) => h).join(';')];
  for (const m of state.measurements) {
    const d = derive(m, state.profile);
    lines.push(cols.map(([, get]) => cell(get(m, d))).join(';'));
  }
  download(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    `medidas-${slug(state.profile.name)}-${todayISO()}.csv`);
  toast('CSV exportado');
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function updateStorageInfo() {
  if (!navigator.storage?.estimate) return;
  try {
    const { usage } = await navigator.storage.estimate();
    if (usage) $('#storageInfo').textContent = `Uso atual: ${(usage / 1048576).toFixed(1)} MB neste aparelho.`;
  } catch { /* estimativa indisponível */ }
}

/* ══════════════ utilidades ══════════════ */

function parseNum(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = parseFloat(String(value).replace(',', '.'));
  return isFinite(n) ? n : null;
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return todayISO(d);
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'perfil';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escapeAttr = escapeHtml;

let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline não disponível */ });
}

init().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<main><section class="card"><h2>Não foi possível iniciar</h2>
    <p class="hint">${escapeHtml(err.message)}</p>
    <p class="hint">Navegação privada e armazenamento bloqueado impedem o app de salvar os dados.</p></section></main>`;
});
