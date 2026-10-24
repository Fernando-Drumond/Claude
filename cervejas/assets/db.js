/* Camada de dados — IndexedDB. Tudo fica no aparelho, nada sai daqui. */

const DB_NAME = 'cervejas-db';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('beers')) {
        db.createObjectStore('beers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('beerId', 'beerId');
      }
      if (!db.objectStoreNames.contains('photos')) {
        db.createObjectStore('photos', { keyPath: 'beerId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Banco bloqueado por outra aba aberta.'));
  });
  return dbPromise;
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
async function write(stores, fn) {
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(stores, 'readwrite');
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transação cancelada'));
    fn(t);
  });
}

/* ---------- cervejas e consumos ---------- */
export const listBeers = () => all('beers');
export const listEntries = () => all('entries');
export const getPhoto = (beerId) => one('photos', beerId).then((r) => r?.blob || null);
export const listPhotos = () => all('photos');

/* Salva cerveja + consumo juntos. photo: Blob para trocar, null para remover, undefined para manter. */
export async function saveCheckin(beer, entry, photo) {
  await write(['beers', 'entries', 'photos'], (t) => {
    t.objectStore('beers').put(beer);
    if (entry) t.objectStore('entries').put(entry);
    if (photo) t.objectStore('photos').put({ beerId: beer.id, blob: photo });
    if (photo === null) t.objectStore('photos').delete(beer.id);
  });
}

export const deleteEntry = (id) => write(['entries'], (t) => t.objectStore('entries').delete(id));

export async function deleteBeer(id) {
  const entries = await all('entries', 'beerId', id);
  await write(['beers', 'entries', 'photos'], (t) => {
    t.objectStore('beers').delete(id);
    t.objectStore('photos').delete(id);
    entries.forEach((e) => t.objectStore('entries').delete(e.id));
  });
}

export const clearAll = () => write(['beers', 'entries', 'photos'], (t) => {
  t.objectStore('beers').clear();
  t.objectStore('entries').clear();
  t.objectStore('photos').clear();
});

/* ---------- backup ---------- */
export async function exportAll() {
  const [beers, entries, photos] = await Promise.all([all('beers'), all('entries'), all('photos')]);
  const encoded = [];
  for (const p of photos) encoded.push({ beerId: p.beerId, dataUrl: await blobToDataUrl(p.blob) });
  return {
    app: 'cervejas', version: 1, exportedAt: new Date().toISOString(),
    beers, entries, photos: encoded,
  };
}

export async function importAll(data, { replace = false } = {}) {
  if (!data || data.app !== 'cervejas' || !Array.isArray(data.beers)) {
    throw new Error('Arquivo de backup inválido.');
  }
  const photos = [];
  for (const p of data.photos || []) photos.push({ beerId: p.beerId, blob: await dataUrlToBlob(p.dataUrl) });
  await write(['beers', 'entries', 'photos'], (t) => {
    if (replace) {
      t.objectStore('beers').clear();
      t.objectStore('entries').clear();
      t.objectStore('photos').clear();
    }
    data.beers.forEach((b) => t.objectStore('beers').put(b));
    (data.entries || []).forEach((e) => t.objectStore('entries').put(e));
    photos.forEach((p) => t.objectStore('photos').put(p));
  });
  return { beers: data.beers.length, entries: (data.entries || []).length, photos: photos.length };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
