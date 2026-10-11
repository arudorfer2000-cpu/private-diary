/**
 * Web app storage: one small IndexedDB key-value store. Used only by the *.web.ts files
 * (never imported by the iPhone code). Everything stored here is already sealed by src/crypto
 * (database file) or wrapped by the passcode (key bundle); nothing readable is kept.
 */
const NAME = 'private-diary';
const STORE = 'kv';

let opened: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opened) {
    opened = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        opened = null;
        reject(req.error);
      };
    });
  }
  return opened;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    // for writes, wait for the transaction to be durable, not only for the request
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idbGet = <T,>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const idbSet = (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key)).then(() => undefined);
export const idbRemove = (key: string) => tx('readwrite', (s) => s.delete(key)).then(() => undefined);

/** Ask the browser not to evict the diary when storage is low. Safe to ignore if refused. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
