import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom, encryptEntry } from '../crypto/diaryCrypto';
import type { Db } from './db';
import { EntryRepository, prepareSchema } from './entryRepository';
import { EditorSession } from '../editor/editorSession';
import { addTag, cleanTag } from '../tags';

configureRandom((n) => new Uint8Array(randomBytes(n)));

const DAY = 24 * 60 * 60 * 1000;

function nodeDb(path: string): Db {
  const d = new DatabaseSync(path);
  return {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
}

async function fresh(clock = { t: 1_700_000_000_000 }) {
  const dir = mkdtempSync(join(tmpdir(), 'diary-tr-'));
  const file = join(dir, 'diary.db');
  const db = nodeDb(file);
  await prepareSchema(db);
  const key = new Uint8Array(randomBytes(32));
  const repo = new EntryRepository(db, key, () => clock.t);
  const rows = async () => (await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM entries'))[0].n;
  return { dir, file, db, key, repo, clock, rows, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const E = (text: string, tags: string[] = []) => ({ mood: 3, title: 't-' + text, text, tags });

test('G1 tags round-trip encrypted; old entries without tags load with none', async () => {
  const { repo, db, key, file, cleanup } = await fresh();
  const made = await repo.create('2026-10-09', E('hello', ['Familie', 'Größe', 'geheim-tag-qwx']));
  assert.deepEqual((await repo.get(made.id))?.entry.tags, ['Familie', 'Größe', 'geheim-tag-qwx']);
  // an entry saved by an older version (payload without a tags field)
  const oldId = 'a'.repeat(32);
  const payload = encryptEntry(key, oldId, JSON.stringify({ mood: 2, title: 'old', text: 'old text' }));
  await db.run('INSERT INTO entries (id, day, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?)', [oldId, '2026-10-01', 1, 1, payload]);
  assert.deepEqual((await repo.get(oldId))?.entry, { mood: 2, title: 'old', text: 'old text', tags: [] });
  await db.close();
  const raw = readFileSync(file);
  assert.ok(!raw.toString('latin1').includes('geheim-tag-qwx') && !raw.toString('utf8').includes('Größe'));
  cleanup();
});

test('G2 tag cleaning', () => {
  assert.equal(cleanTag('  ##  Work   life '), 'Work life');
  assert.equal(cleanTag('#'), '');
  assert.equal(cleanTag('x'.repeat(50)).length, 30);
  let t: string[] = [];
  t = addTag(t, '#Family');
  t = addTag(t, 'family');
  t = addTag(t, ' FAMILY ');
  t = addTag(t, '   ');
  t = addTag(t, 'Work');
  assert.deepEqual(t, ['Family', 'Work']);
  let many: string[] = [];
  for (let i = 0; i < 15; i++) many = addTag(many, 'tag' + i);
  assert.equal(many.length, 10);
});

test('G3 trashed entries leave month list and day list; show in trash; restore brings them back', async () => {
  const { repo, clock, cleanup } = await fresh();
  const a = await repo.create('2026-10-09', E('a', ['x']));
  const b = await repo.create('2026-10-10', E('b'));
  clock.t += 1000;
  await repo.trash(a.id);
  assert.deepEqual((await repo.listMonth('2026-10')).map((e) => e.id), [b.id]);
  assert.deepEqual(await repo.listDays(), ['2026-10-10']);
  const trash = await repo.listTrash();
  assert.equal(trash.length, 1);
  assert.equal(trash[0].id, a.id);
  assert.equal(trash[0].deletedAt, clock.t);
  await repo.restore(a.id);
  assert.equal((await repo.listTrash()).length, 0);
  const back = await repo.listMonth('2026-10');
  assert.deepEqual(back.map((e) => e.id), [a.id, b.id]);
  assert.deepEqual(back[0].entry, E('a', ['x']));
  assert.equal(back[0].deletedAt, null);
  cleanup();
});

test('G4 purge: 30 days gone, 29 days kept, untrashed untouched', async () => {
  const { repo, clock, rows, cleanup } = await fresh();
  const old = await repo.create('2026-09-01', E('old'));
  const recent = await repo.create('2026-09-02', E('recent'));
  const live = await repo.create('2026-09-03', E('live'));
  const t0 = clock.t;
  clock.t = t0 - 30 * DAY;
  await repo.trash(old.id);
  clock.t = t0 - 29 * DAY;
  await repo.trash(recent.id);
  clock.t = t0 + 365 * DAY; // far future: live entry is old but never trashed
  const nowLater = clock.t;
  clock.t = t0;
  await repo.purgeExpired();
  assert.equal(await rows(), 2);
  assert.equal(await repo.get(old.id), null);
  assert.ok(await repo.get(recent.id));
  assert.ok(await repo.get(live.id));
  clock.t = nowLater;
  await repo.purgeExpired();
  assert.equal(await rows(), 1, 'recent now expired, live entry still there');
  assert.ok(await repo.get(live.id));
  cleanup();
});

test('G5 delete forever and empty trash remove rows', async () => {
  const { repo, rows, cleanup } = await fresh();
  const a = await repo.create('2026-10-01', E('a'));
  const b = await repo.create('2026-10-02', E('b'));
  const c = await repo.create('2026-10-03', E('c'));
  await repo.trash(a.id);
  await repo.trash(b.id);
  await repo.deletePermanently(a.id);
  assert.equal(await rows(), 2);
  await repo.emptyTrash();
  assert.equal(await rows(), 1);
  assert.ok(await repo.get(c.id));
  cleanup();
});

test('G6 database from the v0.6 schema is upgraded and keeps its entries', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'diary-mig-'));
  const file = join(dir, 'old.db');
  const d = new DatabaseSync(file);
  d.exec(`CREATE TABLE entries (id TEXT PRIMARY KEY NOT NULL, day TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
          CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`);
  const key = new Uint8Array(randomBytes(32));
  const id = 'b'.repeat(32);
  d.prepare('INSERT INTO entries VALUES (?, ?, ?, ?, ?)').run(id, '2026-10-05', 1, 1, encryptEntry(key, id, JSON.stringify({ mood: 4, title: 'kept', text: 'kept text' })));
  d.close();
  const db = nodeDb(file);
  await prepareSchema(db);
  await prepareSchema(db); // twice is harmless
  const cols = await db.all<{ name: string }>('PRAGMA table_info(entries)');
  assert.ok(cols.some((c) => c.name === 'deleted_at'));
  const repo = new EntryRepository(db, key);
  const list = await repo.listMonth('2026-10');
  assert.equal(list.length, 1);
  assert.equal(list[0].entry.title, 'kept');
  await repo.trash(id);
  assert.equal((await repo.listTrash()).length, 1);
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('G7 editor: emptied entry goes to trash and typing restores the same one (see also A5, A7)', async () => {
  const { repo, rows, cleanup } = await fresh();
  const s = new EditorSession(repo, '2026-10-11', null, 0, { set: () => 0, clear: () => {} });
  s.change(E('first'));
  await s.flush();
  const id = (await repo.listMonth('2026-10'))[0].id;
  s.change({ mood: 3, title: '', text: '', tags: [] });
  await s.flush();
  assert.equal((await repo.listTrash())[0].id, id);
  s.change(E('second'));
  await s.flush();
  assert.equal(await rows(), 1);
  assert.equal((await repo.listMonth('2026-10'))[0].id, id);
  // original restored by discard even after being emptied
  const made = await repo.create('2026-10-12', E('orig', ['k']));
  const e2 = new EditorSession(repo, '2026-10-12', made, 0, { set: () => 0, clear: () => {} });
  e2.change({ mood: 3, title: '', text: '', tags: [] });
  await e2.flush();
  assert.equal((await repo.listTrash()).length, 1);
  await e2.discard();
  assert.equal((await repo.listTrash()).length, 0);
  assert.deepEqual((await repo.get(made.id))?.entry, E('orig', ['k']));
  cleanup();
});

test('G8 past date in an earlier month is listed in that month only', async () => {
  const { repo, cleanup } = await fresh();
  const s = new EditorSession(repo, '2026-08-17', null, 0, { set: () => 0, clear: () => {} });
  s.change(E('long ago'));
  await s.flush();
  assert.deepEqual((await repo.listMonth('2026-08')).map((e) => e.day), ['2026-08-17']);
  assert.deepEqual(await repo.listMonth('2026-10'), []);
  assert.deepEqual(await repo.listMonth('2026-07'), []);
  cleanup();
});

test('G9 moveToTrash saves pending text first, then trashes; nothing saved means nothing to do', async () => {
  const { repo, cleanup } = await fresh();
  const none = new EditorSession(repo, '2026-10-11', null, 600, { set: () => 0, clear: () => {} });
  await none.moveToTrash();
  assert.equal((await repo.listTrash()).length, 0);

  const s = new EditorSession(repo, '2026-10-11', null, 600, { set: () => 0, clear: () => {} });
  s.change(E('typed just now', ['t']));
  await s.moveToTrash();
  const trash = await repo.listTrash();
  assert.equal(trash.length, 1);
  assert.equal(trash[0].entry.text, 'typed just now');
  assert.equal((await repo.listMonth('2026-10')).length, 0);
  cleanup();
});
