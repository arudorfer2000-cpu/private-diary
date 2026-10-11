import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom, unlockWithRecoveryKey, type KeyBundle } from '../crypto/diaryCrypto';
import type { Db } from '../storage/db';
import { EntryRepository, eraseOldDiary, needsRestore, peekRecoveryBlob, prepareSchema, saveRecoveryBlob } from '../storage/entryRepository';
import { MemoryStore } from './store';
import { VaultService } from './vaultService';

configureRandom((n) => new Uint8Array(randomBytes(n)));

const FAST = { m: 64, t: 1, p: 1 };
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function nodeDb(path: string): Db {
  const d = new DatabaseSync(path);
  return {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
}

/** "Phone A": a set-up diary with entries and the recovery blob in its database. */
async function phoneA() {
  const dir = mkdtempSync(join(tmpdir(), 'diary-A-'));
  const file = join(dir, 'diary.db');
  const db = nodeDb(file);
  await prepareSchema(db);
  const store = new MemoryStore();
  const vault = new VaultService(store, Date.now, FAST);
  const created = await vault.setup('482915');
  const repo = new EntryRepository(db, created.dataKey);
  for (let i = 0; i < 12; i++) await repo.create(`2026-10-${String(i + 1).padStart(2, '0')}`, { mood: 1 + (i % 5), title: `Title ${i} ä`, text: `Private words number ${i} 😀`, tags: [`tag${i % 3}`] });
  await saveRecoveryBlob(db, await vault.getRecoveryBlob());
  await db.close();
  return { dir, file, created, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** "Phone B": only the database file arrives; the key store is empty. */
async function phoneB(a: Awaited<ReturnType<typeof phoneA>>) {
  const dir = mkdtempSync(join(tmpdir(), 'diary-B-'));
  const file = join(dir, 'diary.db');
  copyFileSync(a.file, file);
  const db = nodeDb(file);
  const store = new MemoryStore();
  let t = 1_000_000;
  const vault = new VaultService(store, () => t, FAST);
  return { dir, file, db, store, vault, advance: (ms: number) => void (t += ms), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('R1 recovery blob + recovery key give back the data key; every entry decrypts', async () => {
  const a = await phoneA();
  const b = await phoneB(a);
  const blob = await peekRecoveryBlob(b.db);
  assert.ok(blob);
  const r = await b.vault.restoreWithRecovery(blob, a.created.recoveryKey);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(hex(r.dataKey), hex(a.created.dataKey));
  const repo = new EntryRepository(b.db, r.dataKey);
  const all = await repo.listAll();
  assert.equal(all.length, 12);
  assert.ok(all.every((e) => /^Title \d+ ä$/.test(e.entry.title) && e.entry.text.endsWith('😀')));
  await b.db.close();
  a.cleanup();
  b.cleanup();
});

test('R2 wrong or malformed recovery key: refused, counted, paused after 5; vault stays not set up; blob untouched', async () => {
  const a = await phoneA();
  const b = await phoneB(a);
  const blob = (await peekRecoveryBlob(b.db))!;
  const wrong = 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH-IIII-JJJJ-KKKK-LLLL-MMMM'.replace(/[IJKLM]/g, '2');
  const first = await b.vault.restoreWithRecovery(blob, wrong);
  assert.ok(!first.ok && first.reason === 'wrong' && first.triesLeft === 4);
  const second = await b.vault.restoreWithRecovery(blob, 'not a key');
  assert.ok(!second.ok && second.reason === 'wrong' && second.triesLeft === 3);
  for (let i = 0; i < 3; i++) await b.vault.restoreWithRecovery(blob, wrong);
  const paused = await b.vault.restoreWithRecovery(blob, a.created.recoveryKey);
  assert.ok(!paused.ok && paused.reason === 'paused', 'right key refused during the pause');
  b.advance(31_000);
  const ok = await b.vault.restoreWithRecovery(blob, a.created.recoveryKey);
  assert.ok(ok.ok, 'works after the pause');
  assert.equal(await b.vault.isSetUp(), false, 'nothing stored yet');
  assert.equal(await peekRecoveryBlob(b.db), blob);
  await assert.rejects(() => b.vault.restoreWithRecovery('{"nonsense":1}', a.created.recoveryKey));
  await b.db.close();
  a.cleanup();
  b.cleanup();
});

test('R3 finishing a restore: new passcode works, recovery key still works, an existing vault cannot be overwritten', async () => {
  const a = await phoneA();
  const b = await phoneB(a);
  const blob = (await peekRecoveryBlob(b.db))!;
  const r = await b.vault.restoreWithRecovery(blob, a.created.recoveryKey);
  assert.ok(r.ok);
  if (!r.ok) return;
  await assert.rejects(() => b.vault.finishRestore(blob, r.dataKey, '12'), /6 digits/);
  await b.vault.finishRestore(blob, r.dataKey, '739104');
  assert.equal(await b.vault.isSetUp(), true);
  const u = await b.vault.unlock('739104');
  assert.ok(u.ok);
  if (u.ok) assert.equal(hex(u.dataKey), hex(a.created.dataKey));
  assert.ok(!(await b.vault.unlock('482915')).ok, 'phone A passcode means nothing here');
  const viaRecovery = await b.vault.unlockWithRecovery(a.created.recoveryKey);
  assert.ok(viaRecovery.ok);
  await assert.rejects(() => b.vault.finishRestore(blob, r.dataKey, '246810'), /already set up/);
  await assert.rejects(() => b.vault.restoreWithRecovery(blob, a.created.recoveryKey), /already set up/);
  assert.ok(!b.store.dump().includes(hex(a.created.dataKey)), 'data key not stored readable');
  await b.db.close();
  a.cleanup();
  b.cleanup();
});

test('R4 a restore is offered only for "entries here, no keys"', async () => {
  const a = await phoneA();
  const b = await phoneB(a);
  const blob = await peekRecoveryBlob(b.db);
  assert.equal(needsRestore(await b.vault.isSetUp(), blob), true, 'new phone with database');
  const empty = nodeDb(':memory:');
  assert.equal(await peekRecoveryBlob(empty), null, 'fresh install: no blob, reading it needs no key');
  assert.equal(needsRestore(false, null), false);
  const setUp = new VaultService(new MemoryStore(), Date.now, FAST);
  await setUp.setup('482915');
  assert.equal(needsRestore(await setUp.isSetUp(), blob), false, 'normal launch of a set-up vault');
  await b.db.close();
  a.cleanup();
  b.cleanup();
});

test('R5 "start a new diary instead": old data erased and compacted, no restore offered, fresh setup works', async () => {
  const a = await phoneA();
  const b = await phoneB(a);
  assert.ok(await peekRecoveryBlob(b.db));
  await eraseOldDiary(b.db);
  assert.equal(await peekRecoveryBlob(b.db), null);
  assert.equal(needsRestore(await b.vault.isSetUp(), await peekRecoveryBlob(b.db)), false);
  assert.equal((await b.db.all<{ n: number }>('SELECT COUNT(*) AS n FROM entries'))[0].n, 0);
  await b.db.close();
  const raw = readFileSync(b.file).toString('latin1');
  assert.ok(!/v1\.[0-9a-f]{48}\./.test(raw) && !raw.includes('wrappedByRecovery'));
  const fresh = new VaultService(new MemoryStore(), Date.now, FAST);
  const made = await fresh.setup('739104');
  assert.notEqual(hex(made.dataKey), hex(a.created.dataKey));
  a.cleanup();
  b.cleanup();
});

test('R6 whole path on real files: phone A -> database file only -> phone B restore -> new passcode -> lock -> unlock', async () => {
  const a = await phoneA();
  const b = await phoneB(a);
  const blob = (await peekRecoveryBlob(b.db))!;
  assert.equal(needsRestore(await b.vault.isSetUp(), blob), true);
  const r = await b.vault.restoreWithRecovery(blob, a.created.recoveryKey.toLowerCase().replace(/-/g, ' '));
  assert.ok(r.ok, 'recovery key typed in lower case with spaces is accepted');
  if (!r.ok) return;
  await b.vault.finishRestore(blob, r.dataKey, '135790');
  const before = await new EntryRepository(b.db, r.dataKey).listAll();
  assert.equal(before.length, 12);
  await b.db.close();
  // "app restart" on phone B: same key store, same database file
  const db2 = nodeDb(b.file);
  const vault2 = new VaultService(b.store, Date.now, FAST);
  assert.equal(needsRestore(await vault2.isSetUp(), await peekRecoveryBlob(db2)), false, 'no restore offered any more');
  const u = await vault2.unlock('135790');
  assert.ok(u.ok);
  if (!u.ok) return;
  const after = await new EntryRepository(db2, u.dataKey).listAll();
  assert.deepEqual(after.map((e) => e.entry), before.map((e) => e.entry));
  const bundleCheck = JSON.parse(await vault2.getRecoveryBlob()) as KeyBundle;
  assert.equal(hex(unlockWithRecoveryKey(bundleCheck, a.created.recoveryKey)), hex(a.created.dataKey));
  await db2.close();
  a.cleanup();
  b.cleanup();
});
