import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom } from '../crypto/diaryCrypto';
import type { Db } from './db';
import { EntryRepository, prepareSchema } from './entryRepository';

configureRandom((n) => new Uint8Array(randomBytes(n)));

function spyDb() {
  const d = new DatabaseSync(':memory:');
  const rowsReturned: number[] = [];
  const db: Db = {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => {
      const r = d.prepare(sql).all(...params) as T[];
      rowsReturned.push(r.length);
      return r;
    },
    close: async () => void d.close(),
  };
  return { db, rowsReturned };
}
const e = (text: string) => ({ mood: 3, title: '', text, tags: [] });

test('O1 on this day: earlier years only, same month and day, newest year first', async () => {
  const { db } = spyDb();
  await prepareSchema(db);
  const repo = new EntryRepository(db, new Uint8Array(randomBytes(32)));
  await repo.create('2024-10-11', e('two years ago'));
  await repo.create('2025-10-11', e('last year'));
  await repo.create('2026-10-11', e('this year'));
  await repo.create('2025-10-12', e('other day'));
  await repo.create('2025-11-11', e('other month'));
  const trashed = await repo.create('2023-10-11', e('trashed'));
  await repo.trash(trashed.id);
  const got = await repo.listOnDay(10, 11, 2026);
  assert.deepEqual(got.map((g) => g.entry.text), ['last year', 'two years ago']);
  assert.deepEqual(got.map((g) => g.day), ['2025-10-11', '2024-10-11']);
  assert.deepEqual((await repo.listOnDay(10, 11, 2025)).map((g) => g.entry.text), ['two years ago']);
  assert.deepEqual(await repo.listOnDay(3, 3, 2026), []);
});

test('O1 on this day: 29 February only matches 29 February', async () => {
  const { db } = spyDb();
  await prepareSchema(db);
  const repo = new EntryRepository(db, new Uint8Array(randomBytes(32)));
  await repo.create('2024-02-29', e('leap day'));
  await repo.create('2023-02-28', e('not leap'));
  assert.deepEqual((await repo.listOnDay(2, 29, 2028)).map((g) => g.entry.text), ['leap day']);
});

test('O2 only matching rows are read from the database', async () => {
  const { db, rowsReturned } = spyDb();
  await prepareSchema(db);
  const repo = new EntryRepository(db, new Uint8Array(randomBytes(32)));
  for (let y = 2010; y < 2020; y++) await repo.create(`${y}-05-0${1 + (y % 3)}`, e('x' + y));
  rowsReturned.length = 0;
  const got = await repo.listOnDay(5, 1, 2026);
  assert.equal(rowsReturned.length, 1);
  assert.equal(rowsReturned[0], got.length);
  assert.ok(got.length > 0 && got.length < 10);
});
