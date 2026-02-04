/**
 * IndexedDB storage for BC object designer
 * - Stores the last parsed app state for auto-restore
 * - Stores source files from .app packages for fast retrieval
 * - Schema v2: added sourceFiles object store
 */

/* global JSZip */

const DB_NAME = 'bc-object-designer-db';
const DB_VERSION = 2;
const STORE = 'state';
const SOURCE_FILES_STORE = 'sourceFiles';
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
      if (!db.objectStoreNames.contains(SOURCE_FILES_STORE)) {
        // Store source files with composite key: type + objectId (e.g., "table_18", "page_21")
        db.createObjectStore(SOURCE_FILES_STORE, { keyPath: 'key' });
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

/** Generate composite key from object type and id */
function makeObjectKey(type, id) {
  if (!type || id == null) return null;
  return `${String(type).toLowerCase()}_${id}`;
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

/** Clear stored state and delete entire database */
export async function clearLastState() {
  try {
    if (!('indexedDB' in window)) return false;
    // Delete the entire database
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        console.warn('Database deletion blocked');
        resolve(); // Resolve anyway
      };
    });
    return true;
  } catch (err) {
    console.error('Failed to delete database:', err);
    return false;
  }
}

/**
 * Extract and store all .al source files from ZIP to IndexedDB
 * @param {ArrayBuffer} zipBuffer - The ZIP file buffer
 */
export async function storeSourceFilesFromZip(zipBuffer) {
  try {
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(zipBuffer);
    
    // Find all .al files in the ZIP
    const alFiles = Object.values(zip.files).filter(f => !f.dir && /\.al$/i.test(f.name));
    
    // Read all file contents first (before opening transaction)
    const fileContents = [];
    for (const file of alFiles) {
      try {
        const content = await file.async('text');
        const cleanContent = content.replace(/^\uFEFF/, ''); // Strip BOM
        
        // Extract object type and id from AL file content
        const typeMatch = cleanContent.match(/^\s*(table|page|codeunit|report|query|xmlport|enum|enumextension|tableextension|pageextension|reportextension|profile|permissionset|entitlement|controladdin|interface|dotnet)\s+/im);
        const idMatch = cleanContent.match(/^\s*(?:table|page|codeunit|report|query|xmlport|enum|enumextension|tableextension|pageextension|reportextension|profile|permissionset|entitlement|controladdin|interface|dotnet)\s+(\d+)\s+/im);
        
        const objType = typeMatch ? typeMatch[1].toLowerCase() : null;
        const objId = idMatch ? idMatch[1] : null;
        
        // Create composite key using type_id, fallback to filename if parsing fails
        const basename = file.name.split(/[\\\/]/).pop().toLowerCase();
        const compositeKey = objType && objId ? makeObjectKey(objType, objId) : basename;
        
        fileContents.push({
          key: compositeKey,
          filename: file.name,
          objectType: objType,
          objectId: objId,
          content: cleanContent,
          storedAt: Date.now()
        });
      } catch (err) {
        console.warn(`Failed to read ${file.name}:`, err);
      }
    }
    
    // Now store all files in a single transaction (synchronously)
    const db = await openDB();
    const tx = db.transaction(SOURCE_FILES_STORE, 'readwrite');
    const store = tx.objectStore(SOURCE_FILES_STORE);
    
    for (const record of fileContents) {
      store.put(record);
    }
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
    
    db.close();
    return fileContents.length;
  } catch (err) {
    console.error('Failed to store source files:', err);
    return 0;
  }
}

/**
 * Get a source file from IndexedDB by type and id
 * @param {string} type - Object type (e.g., "table", "page")
 * @param {number|string} id - Object ID
 * @param {string} filename - Optional fallback filename for backward compatibility
 */
export async function getSourceFile(type, id, filename) {
  try {
    const db = await openDB();
    
    // Try composite key first (type_id)
    if (type && id != null) {
      const compositeKey = makeObjectKey(type, id);
      console.log('Looking up source by composite key:', compositeKey);
      const rec = await get(db, SOURCE_FILES_STORE, compositeKey);
      if (rec?.content) {
        db.close();
        return rec.content;
      }
    }
    
    // Fallback to filename if provided (for backward compatibility)
    if (filename) {
      const basename = String(filename).split(/[\\\/]/).pop().toLowerCase();
      console.log('Fallback to filename lookup:', basename);
      const rec = await get(db, SOURCE_FILES_STORE, basename);
      if (rec?.content) {
        db.close();
        return rec.content;
      }
    }
    
    db.close();
    return null;
  } catch (err) {
    console.warn('Failed to get source file:', err);
    return null;
  }
}

/**
 * Get source file by object type, id, and optional fallbacks
 * @param {string} type - Object type (e.g., "table", "page")
 * @param {number|string} id - Object ID
 * @param {string} refSrc - Optional reference source filename for fallback
 * @param {string} objName - Optional object name for fallback matching
 */
export async function getSourceForObject(type, id, refSrc, objName) {
  // Try type + id composite key first (most reliable)
  if (type && id != null) {
    const content = await getSourceFile(type, id);
    if (content) {
      console.log(`Retrieved source for ${type}_${id}:`, 'FOUND');
      return content;
    }
  }
  
  // Try refSrc as fallback
  if (refSrc) {
    const content = await getSourceFile(null, null, refSrc);
    if (content) {
      console.log('Retrieved source via refSrc:', refSrc, 'FOUND');
      return content;
    }
  }
  
  // Fallback to name-based matching
  if (objName) {
    const nameKey = objName.replace(/"/g, '') + '.al';
    const content = await getSourceFile(null, null, nameKey);
    console.log('Retrieved source via name:', nameKey, content ? 'FOUND' : 'NOT FOUND');
    if (content) return content;
  }
  
  console.log(`No source found for ${type}_${id}`);
  return null;
}

/** Whether storage is supported in this browser */
export const storageSupported = !!('indexedDB' in window);
