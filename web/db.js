const DB_NAME = 'image_journal';
const DB_VERSION = 1;
let _dbPromise;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) {
        db.createObjectStore('days', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('items')) {
        const store = db.createObjectStore('items', { keyPath: 'id' });
        store.createIndex('by_day', 'dayId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(store, mode) {
  const db = await openDb();
  return db.transaction(store, mode).objectStore(store);
}

export async function ensureDay(dayId) {
  const store = await tx('days', 'readwrite');
  return new Promise((resolve, reject) => {
    const getReq = store.get(dayId);
    getReq.onsuccess = () => {
      if (!getReq.result) {
        const day = { id: dayId, items: [], createdAt: Date.now() };
        const putReq = store.put(day);
        putReq.onsuccess = () => resolve(day);
        putReq.onerror = () => reject(putReq.error);
      } else {
        resolve(getReq.result);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

export async function listDays(limit = 21) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction('days', 'readonly').objectStore('days');
    const req = store.getAll();
    req.onsuccess = () => {
      const days = req.result.sort((a, b) => (a.id < b.id ? 1 : -1));
      resolve(days.slice(0, limit));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function addItem(item) {
  const store = await tx('items', 'readwrite');
  return new Promise((resolve, reject) => {
    const putReq = store.put(item);
    putReq.onsuccess = () => resolve(item);
    putReq.onerror = () => reject(putReq.error);
  });
}

export async function itemsByDay(dayId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const idx = db.transaction('items', 'readonly').objectStore('items').index('by_day');
    const req = idx.getAll(dayId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function updateItem(item) { return addItem(item); }
