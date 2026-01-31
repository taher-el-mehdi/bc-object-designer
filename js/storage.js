/**
 * IndexedDB storage for BC object designer
 * - Stores the last parsed app state for auto-restore
 * - Schema v1: object store `state` with keyPath `id`
 */

const DB_NAME = 'bc-object-designer-db';
const DB_VERSION = 1;
const STORE = 'state';
const LAST_KEY = 'last';

/** Open (and upgrade if needed) the IndexedDB database */
function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Put a record in a store */
function put(db, store, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('Transaction error'));
    tx.oncomplete = () => resolve();
    tx.objectStore(store).put(value);
  });
}

/** Get a record by key */
function get(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('Transaction error'));
    const req = tx.objectStore(store).get(key);
    req.onerror = () => reject(req.error || new Error('Get failed'));
    req.onsuccess = () => resolve(req.result || null);
  });
}

/** Clear a store */
function clear(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('Transaction error'));
    tx.oncomplete = () => resolve();
    tx.objectStore(store).clear();
  });
}

/**
 * Save last state to IndexedDB. Stores only parsed objects and minimal metadata for fast restore.
 * @param {{filename:string, info?:any, objects:any[]}} payload
 */
export async function saveLastState(payload) {
  const db = await openDB();
  const record = {
    id: LAST_KEY,
    filename: payload.filename || '',
    info: payload.info || undefined,
    objects: payload.objects || [],
    savedAt: Date.now(),
    schema: 1
  };
  await put(db, STORE, record);
  db.close();
}

/** Load last state from IndexedDB */
export async function loadLastState() {
  try {
    const db = await openDB();
    const rec = await get(db, STORE, LAST_KEY);
    db.close();
    return rec;
  } catch (err) {
    // Graceful fallback: no stored state or not supported
    return null;
  }
}

/** Clear stored state */
export async function clearLastState() {
  try {
    const db = await openDB();
    await clear(db, STORE);
    db.close();
    return true;
  } catch (err) {
    return false;
  }
}

/** Whether storage is supported in this browser */
export const storageSupported = !!('indexedDB' in window);
