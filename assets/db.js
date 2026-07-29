/* Camada de dados — IndexedDB. Tudo fica no aparelho, nada sai daqui. */

const DB_NAME = 'corpo-db';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('measurements')) {
        const s = db.createObjectStore('measurements', { keyPath: 'id' });
        s.createIndex('profileId', 'profileId');
        s.createIndex('profileDate', ['profileId', 'date']);
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('measurementId', 'measurementId');
        s.createIndex('profileId', 'profileId');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      void ev;
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Banco bloqueado por outra aba aberta.'));
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transação cancelada'));
    out = fn(t.objectStore(store), t);
  }));
}

export const uid = () =>
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

/* ---------- leitura / escrita genéricas ---------- */
async function all(store, index, query) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const src = index ? t.objectStore(store).index(index) : t.objectStore(store);
    const req = src.getAll(query);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function one(store, key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function put(store, value) {
  await tx(store, 'readwrite', (s) => s.put(value));
  return value;
}
async function del(store, key) {
  await tx(store, 'readwrite', (s) => s.delete(key));
}

export const listProfiles = () => all('profiles').then((r) => r.sort((a, b) => a.createdAt - b.createdAt));
export const getProfile = (id) => one('profiles', id);
export const saveProfile = (p) => put('profiles', p);

export async function deleteProfile(id) {
  const ms = await all('measurements', 'profileId', id);
  const ps = await all('photos', 'profileId', id);
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['profiles', 'measurements', 'photos'], 'readwrite');
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.objectStore('profiles').delete(id);
    ms.forEach((m) => t.objectStore('measurements').delete(m.id));
    ps.forEach((p) => t.objectStore('photos').delete(p.id));
  });
}

/* ---------- medições ---------- */
export const listMeasurements = (profileId) =>
  all('measurements', 'profileId', profileId).then((r) => r.sort((a, b) => a.date.localeCompare(b.date)));
export const getMeasurement = (id) => one('measurements', id);
export const saveMeasurement = (m) => put('measurements', m);

export async function deleteMeasurement(id) {
  const photos = await all('photos', 'measurementId', id);
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['measurements', 'photos'], 'readwrite');
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.objectStore('measurements').delete(id);
    photos.forEach((p) => t.objectStore('photos').delete(p.id));
  });
}

/* ---------- fotos ---------- */
export const listPhotos = (measurementId) =>
  all('photos', 'measurementId', measurementId).then((r) => r.sort((a, b) => a.pose.localeCompare(b.pose)));
export const listAllPhotos = () => all('photos');
export const savePhoto = (p) => put('photos', p);
export const deletePhoto = (id) => del('photos', id);

/* ---------- configurações ---------- */
export async function getSetting(key, fallback = null) {
  const row = await one('settings', key);
  return row === undefined ? fallback : row.value;
}
export const setSetting = (key, value) => put('settings', { key, value });

/* ---------- backup ---------- */
export async function exportAll() {
  const [profiles, measurements, photos] = await Promise.all([
    all('profiles'), all('measurements'), all('photos'),
  ]);
  const encoded = [];
  for (const p of photos) {
    encoded.push({ ...p, blob: undefined, dataUrl: await blobToDataUrl(p.blob) });
  }
  return {
    app: 'corpo', version: 1, exportedAt: new Date().toISOString(),
    profiles, measurements, photos: encoded,
  };
}

export async function importAll(data, { replace = false } = {}) {
  if (!data || data.app !== 'corpo' || !Array.isArray(data.profiles)) {
    throw new Error('Arquivo de backup inválido.');
  }
  const photos = [];
  for (const p of data.photos || []) {
    photos.push({ id: p.id, measurementId: p.measurementId, profileId: p.profileId, pose: p.pose, createdAt: p.createdAt, blob: await dataUrlToBlob(p.dataUrl) });
  }
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['profiles', 'measurements', 'photos'], 'readwrite');
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    if (replace) {
      t.objectStore('profiles').clear();
      t.objectStore('measurements').clear();
      t.objectStore('photos').clear();
    }
    data.profiles.forEach((p) => t.objectStore('profiles').put(p));
    (data.measurements || []).forEach((m) => t.objectStore('measurements').put(m));
    photos.forEach((p) => t.objectStore('photos').put(p));
  });
  return {
    profiles: data.profiles.length,
    measurements: (data.measurements || []).length,
    photos: photos.length,
  };
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
