import * as SQLite from 'expo-sqlite';
import type { Db } from './db';

/** Opens (or creates) the diary database file on the phone. */
export async function openExpoDb(name = 'diary.db'): Promise<Db> {
  const d = await SQLite.openDatabaseAsync(name);
  return {
    exec: (sql) => d.execAsync(sql),
    run: async (sql, params = []) => {
      await d.runAsync(sql, params);
    },
    all: <T,>(sql: string, params: (string | number | null)[] = []) => d.getAllAsync<T>(sql, params),
    close: () => d.closeAsync(),
  };
}
