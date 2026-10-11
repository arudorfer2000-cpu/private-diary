import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom, unlockWithRecoveryKey, type KeyBundle } from '../crypto/diaryCrypto';
import { VaultService } from '../vault/vaultService';
import { MemoryStore } from '../vault/store';
import type { Db } from './db';
import { EntryRepository, loadRecoveryBlob, prepareSchema, saveRecoveryBlob } from './entryRepository';

configureRandom((n) => new Uint8Array(randomBytes(n)));

const FAST = { m: 64, t: 1, p: 1 };
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** Same interface as the phone's expo-sqlite adapter, backed by Node's SQLite on a real file. */
function nodeDb(path: string): Db {
  const d = new DatabaseSync(path);
  return {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
}

async function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'diary-'));
  const file = join(dir, 'diary.db');
  const db = nodeDb(file);
  await prepareSchema(db);
  const key = new Uint8Array(randomBytes(32));
  let t = 1_000;
  const repo = new EntryRepository(db, key, () => (t += 10));
  return { dir, file, db, key, repo, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const SECRET = { mood: 4, title: 'Dad rief an – Grüße 🌿', text: 'Zeile eins\nZeile "zwei" ä ö ü ß 😀 geheimes-wort-xyz', tags: [] };

test('S1 create then read back: content comes back exactly', async () => {
  const { repo, cleanup } = await fresh();
  const made = await repo.create('2026-10-09', SECRET);
  const got = await repo.get(made.id);
  assert.deepEqual(got?.entry, SECRET);
  assert.equal(got?.day, '2026-10-09');
  cleanup();
});

test('S2 database file contains no readable title, text or mood JSON', async () => {
  const { repo, db, file, cleanup } = await fresh();
  await repo.create('2026-10-09', SECRET);
  await db.close(); // flush to the file
  const bytes = readFileSync(file);
  const raw = bytes.toString('latin1');
  const utf = bytes.toString('utf8');
  for (const needle of ['geheimes-wort-xyz', 'Dad rief', 'Grüße', 'Zeile', '"mood"', '"title"', '"text"']) {
    assert.ok(!raw.includes(needle) && !utf.includes(needle), `found readable: ${needle}`);
  }
  assert.ok(raw.includes('2026-10-09'), 'the day is clear by design');
  cleanup();
});

test('S3 update replaces content and ciphertext, keeps created time, moves updated time', async () => {
  const { repo, db, cleanup } = await fresh();
  const made = await repo.create('2026-10-09', SECRET);
  const before = (await db.all<{ payload: string }>('SELECT payload FROM entries'))[0].payload;
  await repo.update(made.id, { mood: 2, title: 'New', text: 'changed', tags: [] });
  const rows = await db.all<{ payload: string }>('SELECT payload FROM entries');
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].payload, before);
  const got = await repo.get(made.id);
  assert.deepEqual(got?.entry, { mood: 2, title: 'New', text: 'changed', tags: [] });
  assert.equal(got?.createdAt, made.createdAt);
  assert.ok(got!.updatedAt > made.updatedAt);
  cleanup();
});

test('S4 delete removes the entry', async () => {
  const { repo, cleanup } = await fresh();
  const a = await repo.create('2026-10-09', SECRET);
  await repo.create('2026-10-10', SECRET);
  await repo.deletePermanently(a.id);
  assert.equal(await repo.get(a.id), null);
  assert.equal((await repo.listMonth('2026-10')).length, 1);
  cleanup();
});

test('S5 month listing: only that month, ordered by day, gaps absent', async () => {
  const { repo, cleanup } = await fresh();
  await repo.create('2026-10-31', { mood: 1, title: 'last', text: 'l', tags: [] });
  await repo.create('2026-09-30', { mood: 1, title: 'sep', text: 's', tags: [] });
  await repo.create('2026-11-01', { mood: 1, title: 'nov', text: 'n', tags: [] });
  await repo.create('2026-10-02', { mood: 3, title: 'second', text: 'b', tags: [] });
  await repo.create('2026-10-01', { mood: 5, title: 'first', text: 'a', tags: [] });
  const oct = await repo.listMonth('2026-10');
  assert.deepEqual(oct.map((e) => e.day), ['2026-10-01', '2026-10-02', '2026-10-31']);
  assert.deepEqual(oct.map((e) => e.entry.title), ['first', 'second', 'last']);
  cleanup();
});

test('S6 wrong key fails; payload copied to another row fails', async () => {
  const { repo, db, cleanup } = await fresh();
  const a = await repo.create('2026-10-01', SECRET);
  const b = await repo.create('2026-10-02', { mood: 1, title: 'other', text: 'other', tags: [] });
  const wrong = new EntryRepository(db, new Uint8Array(randomBytes(32)));
  await assert.rejects(() => wrong.get(a.id));
  const pa = (await db.all<{ payload: string }>('SELECT payload FROM entries WHERE id = ?', [a.id]))[0].payload;
  await db.run('UPDATE entries SET payload = ? WHERE id = ?', [pa, b.id]);
  await assert.rejects(() => repo.get(b.id));
  cleanup();
});

test('S7 data survives reopening the database file', async () => {
  const { file, db, key, repo, cleanup } = await fresh();
  const made = await repo.create('2026-10-09', SECRET);
  await db.close();
  const db2 = nodeDb(file);
  await prepareSchema(db2); // schema creation is repeatable
  const repo2 = new EntryRepository(db2, key);
  assert.deepEqual((await repo2.get(made.id))?.entry, SECRET);
  assert.equal((await repo2.listMonth('2026-10')).length, 1);
  await db2.close();
  cleanup();
});

test('S8 recovery blob is stored in the database, is not readable, and unlocks the data key with the recovery key', async () => {
  const { file, db, cleanup } = await fresh();
  const vault = new VaultService(new MemoryStore(), Date.now, FAST);
  const created = await vault.setup('482915');
  const blob = await vault.getRecoveryBlob();
  await saveRecoveryBlob(db, blob);
  assert.equal(await loadRecoveryBlob(db), blob);
  assert.ok(!blob.includes(hex(created.dataKey)));
  assert.ok(!blob.includes('482915'));
  assert.ok(!blob.includes('wrappedByPasscode'));
  const restored = JSON.parse((await loadRecoveryBlob(db))!) as KeyBundle;
  assert.equal(hex(unlockWithRecoveryKey(restored, created.recoveryKey)), hex(created.dataKey));
  await db.close();
  assert.ok(!readFileSync(file).toString('latin1').includes(hex(created.dataKey)));
  cleanup();
});
