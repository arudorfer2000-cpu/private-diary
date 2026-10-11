import initSqlJs from 'sql.js';
import type { Db } from './db';
import { idbGet, idbSet, requestPersistence } from '../web/idb';

/**
 * WEB APP. The same SQL as on the phone, run in the browser with sql.js. The database file (sealed entries
 * and photos only; day and timestamps are clear, as on the phone) is kept in IndexedDB.
 * A write is reported as done only after the file has really been stored (writes made close together share one save).
 */
const DB_KEY = 'db:diary.sqlite';
const BATCH_MS = 40;

export async function openExpoDb(): Promise<Db> {
  const SQL = await initSqlJs({ locateFile: () => './sql-wasm.wasm' });
  const saved = await idbGet<Uint8Array>(DB_KEY);
  const d = new SQL.Database(saved ?? undefined);
  void requestPersistence();
  // sql.js export() reopens the database, which would end an open transaction, so saving waits for COMMIT/ROLLBACK
  let inTx = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiters: { ok: () => void; fail: (e: unknown) => void }[] = [];
  let chain: Promise<void> = Promise.resolve();

  const save = () => {
    chain = chain.then(async () => {
      const mine = waiters;
      waiters = [];
      try {
        if (dirty && !inTx) {
          dirty = false;
          await idbSet(DB_KEY, d.export());
        }
        mine.forEach((w) => w.ok());
      } catch (e) {
        dirty = true;
        mine.forEach((w) => w.fail(e));
      }
    });
    return chain;
  };
  const persist = (): Promise<void> => {
    dirty = true;
    if (inTx) return Promise.resolve();
    return new Promise<void>((ok, fail) => {
      waiters.push({ ok, fail });
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          void save();
        }, BATCH_MS);
      }
    });
  };
  // leaving the tab: store anything not yet stored
  const onHide = () => {
    if (document.visibilityState === 'hidden' && dirty && !inTx) void save();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  return {
    exec: async (sql) => {
      const word = sql.trim().toUpperCase();
      if (word === 'BEGIN') inTx = true;
      d.exec(sql);
      if (word === 'COMMIT' || word === 'ROLLBACK') inTx = false;
      await persist();
    },
    run: async (sql, params = []) => {
      d.run(sql, params);
      await persist();
    },
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => {
      const st = d.prepare(sql);
      st.bind(params);
      const out: T[] = [];
      while (st.step()) out.push(st.getAsObject() as T);
      st.free();
      return out;
    },
    close: async () => {
      inTx = false;
      await persist();
      await save();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      d.close();
    },
  };
}
