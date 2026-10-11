import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom } from '../crypto/diaryCrypto';
import type { Db } from '../storage/db';
import { EntryRepository, prepareSchema } from '../storage/entryRepository';
import { EditorSession, type Timers } from './editorSession';

configureRandom((n) => new Uint8Array(randomBytes(n)));

function nodeDb(path: string): Db {
  const d = new DatabaseSync(path);
  return {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
}

/** Manual clock: nothing fires until the test advances time. */
function fakeTimers() {
  let now = 0;
  let next = 1;
  const jobs = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      const id = next++;
      jobs.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (h) => void jobs.delete(h as number),
  };
  const advance = async (ms: number) => {
    now += ms;
    for (const [id, j] of [...jobs]) {
      if (j.at <= now) {
        jobs.delete(id);
        j.fn();
      }
    }
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  };
  return { timers, advance, pendingJobs: () => jobs.size };
}

async function fresh() {
  const dir = mkdtempSync(join(tmpdir(), 'diary-ed-'));
  const file = join(dir, 'diary.db');
  const db = nodeDb(file);
  await prepareSchema(db);
  const key = new Uint8Array(randomBytes(32));
  const repo = new EntryRepository(db, key);
  const clock = fakeTimers();
  const day = '2026-10-11';
  const session = (existing = null as Awaited<ReturnType<typeof repo.get>>) =>
    new EditorSession(repo, day, existing, 600, clock.timers);
  const visible = async () => (await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE deleted_at IS NULL'))[0].n;
  const count = async () => (await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM entries'))[0].n;
  return { dir, file, db, key, repo, clock, session, count, visible, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const E = (text: string, title = '', mood = 3) => ({ mood, title, text, tags: [] as string[] });

test('A1 saves after the pause, not before; quick changes make one save with the latest text', async () => {
  const { repo, clock, session, count, cleanup } = await fresh();
  const s = session();
  s.change(E('H'));
  await clock.advance(300);
  s.change(E('Hello'));
  await clock.advance(500); // 800 ms after first change but only 500 after the last
  assert.equal(await count(), 0, 'must not save before the pause is over');
  await clock.advance(200);
  assert.equal(await count(), 1);
  const [saved] = await repo.listMonth('2026-10');
  assert.equal(saved.entry.text, 'Hello');
  cleanup();
});

test('A2 flush saves at once and waits', async () => {
  const { clock, session, count, cleanup } = await fresh();
  const s = session();
  s.change(E('quick note'));
  assert.equal(await count(), 0);
  assert.equal(await s.flush(), true);
  assert.equal(await count(), 1);
  assert.equal(clock.pendingJobs(), 0, 'timer cleared');
  cleanup();
});

test('A3 first save creates, later saves update the same entry, also while a save is running', async () => {
  const { repo, db, clock, session, count, cleanup } = await fresh();
  const s = session();
  s.change(E('one'));
  await clock.advance(600);
  s.change(E('one two'));
  await clock.advance(600);
  assert.equal(await count(), 1);
  // type again while a (slowed down) save is in flight
  const origUpdate = repo.update.bind(repo);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  repo.update = async (id, e) => {
    await gate;
    return origUpdate(id, e);
  };
  s.change(E('one two three'));
  await clock.advance(600); // save starts and waits at the gate
  s.change(E('one two three four'));
  await clock.advance(600); // second save is queued behind the first
  release();
  assert.equal(await s.flush(), true);
  assert.equal(await count(), 1, 'never a duplicate');
  assert.equal((await repo.listMonth('2026-10'))[0].entry.text, 'one two three four');
  await db.close();
  cleanup();
});

test('A4 unchanged content is not saved again', async () => {
  const { repo, session, cleanup } = await fresh();
  const s = session();
  s.change(E('same'));
  await s.flush();
  const before = (await repo.listMonth('2026-10'))[0].updatedAt;
  let writes = 0;
  const u = repo.update.bind(repo);
  repo.update = async (...a) => {
    writes++;
    return u(...a);
  };
  s.change(E('same'));
  await s.flush();
  assert.equal(writes, 0);
  assert.equal((await repo.listMonth('2026-10'))[0].updatedAt, before);
  cleanup();
});

test('A5 empty new entry is never created; emptying an existing entry moves it to the trash (changed requirement, see checks.md 2.1)', async () => {
  const { repo, session, count, visible, cleanup } = await fresh();
  const s = session();
  s.change(E('   ', ''));
  await s.flush();
  assert.equal(await count(), 0);
  s.change(E('text'));
  await s.flush();
  assert.equal(await visible(), 1);
  s.change(E('', '  '));
  await s.flush();
  assert.equal(await visible(), 0, 'no longer shown');
  assert.equal((await repo.listTrash()).length, 1, 'recoverable in the trash');
  s.change(E('again')); // typing again restores the same entry
  await s.flush();
  assert.equal(await visible(), 1);
  assert.equal(await count(), 1, 'same row, no duplicate');
  assert.equal((await repo.listMonth('2026-10'))[0].entry.text, 'again');
  assert.equal((await repo.listTrash()).length, 0);
  cleanup();
});

test('A6 a failed save reports an error, keeps the text and is retried', async () => {
  const { repo, session, count, cleanup } = await fresh();
  const s = session();
  const create = repo.create.bind(repo);
  let fail = true;
  repo.create = async (...a) => {
    if (fail) throw new Error('disk full');
    return create(...a);
  };
  s.change(E('precious words'));
  assert.equal(await s.flush(), false);
  assert.equal(s.status, 'error');
  assert.equal(await count(), 0);
  fail = false;
  assert.equal(await s.flush(), true, 'retry without new typing');
  assert.equal(s.status, 'saved');
  assert.equal((await repo.listMonth('2026-10'))[0].entry.text, 'precious words');
  cleanup();
});

test('A7 discard removes a new entry for good and restores an existing one', async () => {
  const { repo, session, count, cleanup } = await fresh();
  const a = session();
  a.change(E('draft'));
  await a.flush();
  assert.equal(await count(), 1);
  await a.discard();
  assert.equal(await count(), 0, 'deleted for good, not in the trash');

  const made = await repo.create('2026-10-12', E('original', 'Title', 4));
  const b = new EditorSession(repo, '2026-10-12', made);
  b.change(E('rewritten', 'Other', 1));
  await b.flush();
  assert.equal((await repo.get(made.id))?.entry.text, 'rewritten');
  await b.discard();
  assert.deepEqual((await repo.get(made.id))?.entry, E('original', 'Title', 4));
  assert.equal(await count(), 1);
  cleanup();
});

test('A8 killed mid-sentence: a new repository on the same file reads what was typed; file holds no plain text', async () => {
  const { file, db, key, clock, session, cleanup } = await fresh();
  const s = session();
  s.change(E('Dear diary, today I could not stop thinking about gelb-sonnenblume-77'));
  await clock.advance(600); // autosave fires; the app is then "killed": nothing else runs
  await db.close();
  const db2 = nodeDb(file);
  const repo2 = new EntryRepository(db2, key);
  const list = await repo2.listMonth('2026-10');
  assert.equal(list.length, 1);
  assert.equal(list[0].entry.text, 'Dear diary, today I could not stop thinking about gelb-sonnenblume-77');
  await db2.close();
  assert.ok(!readFileSync(file).toString('latin1').includes('sonnenblume'));
  cleanup();
});
