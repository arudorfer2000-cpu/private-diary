/** The few database operations the diary needs. expo-sqlite implements it on the phone, node:sqlite in tests. */
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: (string | number | null)[]): Promise<void>;
  all<T>(sql: string, params?: (string | number | null)[]): Promise<T[]>;
  close(): Promise<void>;
}
