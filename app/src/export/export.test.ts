import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom } from '../crypto/diaryCrypto';
import type { Db } from '../storage/db';
import { EntryRepository, loadRecoveryBlob, prepareSchema, saveRecoveryBlob, type StoredEntry } from '../storage/entryRepository';
import { exportFileName, exportJson, exportMarkdown } from './exporters';
import { wipeAll } from '../data/wipe';
import { MemoryStore } from '../vault/store';
import { VaultService } from '../vault/vaultService';
import { SettingsService, DEFAULT_SETTINGS } from '../settings/settings';

configureRandom((n) => new Uint8Array(randomBytes(n)));

const FAST = { m: 64, t: 1, p: 1 };
const NOW = new Date(2026, 9, 11, 23, 30); // local time

const mk = (id: string, day: string, mood: number, title: string, text: string, tags: string[], createdAt: number, deletedAt: number | null = null): StoredEntry => ({
  id, day, createdAt, updatedAt: createdAt + 1000, deletedAt, entry: { mood, title, text, tags },
});

const SET: StoredEntry[] = [
  mk('c', '2026-10-05', 5, 'Great hike 🏔', 'Über den Wolken.\nZweite Zeile "mit" Anführungszeichen.', ['Family', 'out doors'], 3000),
  mk('a', '2026-09-30', 2, '', 'Short one.', [], 1000),
  mk('b', '2026-10-05', 3, '# Sneaky\n## heading', 'Same day, earlier.', ['x'], 2000),
  mk('t', '2026-10-01', 1, 'Trashed one', 'must-not-be-exported-xyz', [], 500, 99999),
];

test('U1 (TC-16) JSON export: complete, ordered, valid, no trash, no secrets', () => {
  const raw = exportJson(SET, NOW);
  const j = JSON.parse(raw);
  assert.equal(j.app, 'Private Diary');
  assert.equal(j.count, 3);
  assert.equal(j.exportedAt, NOW.toISOString());
  assert.deepEqual(j.entries.map((e: { id: string }) => e.id), ['a', 'b', 'c'], 'oldest first, same day by creation time');
  const c = j.entries[2];
  assert.equal(c.date, '2026-10-05');
  assert.equal(c.mood, 5);
  assert.equal(c.moodName, 'Great');
  assert.equal(c.title, 'Great hike 🏔');
  assert.equal(c.text, 'Über den Wolken.\nZweite Zeile "mit" Anführungszeichen.');
  assert.deepEqual(c.tags, ['Family', 'out doors']);
  assert.equal(c.createdAt, new Date(3000).toISOString());
  assert.equal(c.updatedAt, new Date(4000).toISOString());
  assert.ok(!raw.includes('must-not-be-exported-xyz') && !raw.includes('Trashed one'));
  for (const bad of ['passcode', 'dataKey', 'recovery', 'wrapped', 'salt']) assert.ok(!raw.toLowerCase().includes(bad), bad);
  assert.equal(JSON.parse(exportJson([], NOW)).count, 0);
});

test('U2 Markdown export: sections, order, safe titles, empty diary', () => {
  const md = exportMarkdown(SET, NOW);
  const heads = md.split('\n').filter((l) => l.startsWith('## '));
  assert.equal(heads.length, 3, 'one heading per entry; a title cannot add headings');
  assert.ok(heads[0].startsWith('## 2026-09-30') && heads[0].endsWith('— Untitled'));
  assert.ok(heads[1].endsWith('— Sneaky ## heading'), heads[1]); // flattened to one line
  assert.ok(heads[2].startsWith('## 2026-10-05') && heads[2].includes('Great hike 🏔'));
  assert.ok(md.includes('Mood: Great · #Family #out-doors'));
  assert.ok(md.includes('Über den Wolken.\nZweite Zeile "mit" Anführungszeichen.'));
  assert.ok(md.includes('Mood: Low'));
  assert.ok(!md.includes('must-not-be-exported-xyz'));
  assert.ok(md.startsWith('# Private Diary'));
  assert.ok(md.indexOf('Short one.') < md.indexOf('Same day, earlier.') && md.indexOf('Same day, earlier.') < md.indexOf('Über den Wolken'));
  const empty = exportMarkdown([], NOW);
  assert.ok(empty.includes('There are no entries yet.'));
  assert.equal(empty.split('\n').filter((l) => l.startsWith('## ')).length, 0);
});

test('U3 file names use the local date', () => {
  assert.equal(exportFileName('json', new Date(2026, 9, 11, 23, 59)), 'private-diary-2026-10-11.json');
  assert.equal(exportFileName('md', new Date(2026, 0, 2, 0, 1)), 'private-diary-2026-01-02.md');
  assert.equal(exportFileName('md', new Date(2026, 11, 31, 23, 59)), 'private-diary-2026-12-31.md');
});

function nodeDb(path: string): Db {
  const d = new DatabaseSync(path);
  return {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
}

async function world() {
  const dir = mkdtempSync(join(tmpdir(), 'diary-wipe-'));
  const file = join(dir, 'diary.db');
  const db = nodeDb(file);
  await prepareSchema(db);
  const store = new MemoryStore();
  const vault = new VaultService(store, Date.now, FAST);
  const created = await vault.setup('482915');
  const settings = new SettingsService(store);
  await settings.save({ ...DEFAULT_SETTINGS, theme: 'light', lockMinutes: 15 });
  await store.set('diary.bioflag', '1');
  const repo = new EntryRepository(db, created.dataKey);
  for (let i = 0; i < 40; i++) await repo.create(`2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, { mood: 3, title: `Secret title ${i}`, text: `Very private words ${i} `.repeat(20), tags: ['t'] });
  const trashed = (await repo.listAll())[0];
  await repo.trash(trashed.id);
  await saveRecoveryBlob(db, await vault.getRecoveryBlob());
  let bioRemoved = false;
  return { dir, file, db, store, vault, settings, created, repo, deps: () => ({ db, vault, settings, disableBiometric: async () => { bioRemoved = true; } }), bio: () => bioRemoved, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('U4 (TC-17) delete-all: no rows, no readable text and no sealed entry data left in the file', async () => {
  const w = await world();
  await wipeAll(w.deps());
  assert.equal((await w.db.all<{ n: number }>('SELECT COUNT(*) AS n FROM entries'))[0].n, 0);
  assert.equal(await loadRecoveryBlob(w.db), null);
  assert.equal((await w.repo.listTrash()).length, 0);
  await w.db.close();
  const raw = readFileSync(w.file).toString('latin1');
  assert.ok(!raw.includes('Very private words') && !raw.includes('Secret title'), 'no plaintext');
  assert.ok(!/v1\.[0-9a-f]{48}\./.test(raw), 'no sealed entry payload left in the file');
  assert.ok(!raw.includes('wrappedByRecovery'), 'recovery blob gone');
  w.cleanup();
});

test('U5 delete-all removes keys, counter, Face ID item and settings; fresh setup gives a new key', async () => {
  const w = await world();
  // leave a wrong-try counter behind
  await w.vault.unlock('111112');
  assert.ok(w.store.dump().includes('diary.limiter'));
  await wipeAll(w.deps());
  assert.equal(await w.vault.isSetUp(), false);
  assert.equal(w.bio(), true, 'Face ID item removal was requested');
  assert.ok(!w.store.dump().includes('diary.limiter'));
  assert.ok(!w.store.dump().includes('diary.bundle'));
  assert.deepEqual(await w.settings.load(), DEFAULT_SETTINGS);
  const fresh = new VaultService(w.store, Date.now, FAST);
  const again = await fresh.setup('739104');
  assert.notEqual(Buffer.from(again.dataKey).toString('hex'), Buffer.from(w.created.dataKey).toString('hex'));
  const r = await fresh.unlock('482915');
  assert.ok(!r.ok, 'old passcode no longer works');
  assert.ok((await fresh.unlock('739104')).ok);
  await w.db.close();
  w.cleanup();
});

test('U6 if wiping the database fails, keys and settings stay', async () => {
  const w = await world();
  const broken: Db = { ...w.db, exec: async (sql) => { if (sql.startsWith('DELETE FROM entries')) throw new Error('disk error'); return w.db.exec(sql); } };
  await assert.rejects(() => wipeAll({ ...w.deps(), db: broken }), /disk error/);
  assert.equal(await w.vault.isSetUp(), true);
  assert.equal((await w.settings.load()).theme, 'light');
  assert.equal(w.bio(), false);
  assert.equal((await w.repo.listAll()).length, 39);
  await w.db.close();
  w.cleanup();
});
