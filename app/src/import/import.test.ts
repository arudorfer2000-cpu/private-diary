import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom } from '../crypto/diaryCrypto';
import type { Db } from '../storage/db';
import { EntryRepository, prepareSchema, type StoredEntry } from '../storage/entryRepository';
import { exportJson } from '../export/exporters';
import { parseImport, MAX_IMPORT_CHARS, MAX_ENTRIES } from './importer';

configureRandom((n) => new Uint8Array(randomBytes(n)));

function memDb(failOnInsert = 0): Db {
  const d = new DatabaseSync(':memory:');
  let inserts = 0;
  return {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => {
      if (/^INSERT/i.test(sql.trim()) && /entries/.test(sql) && ++inserts === failOnInsert) throw new Error('disk full (test)');
      d.prepare(sql).run(...params);
    },
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
}
async function repoOf(db: Db, key = new Uint8Array(randomBytes(32))) {
  await prepareSchema(db);
  let t = 5_000;
  return new EntryRepository(db, key, () => (t += 10));
}
const sample = async () => {
  const r = await repoOf(memDb());
  await r.create('2026-10-09', { mood: 4, title: 'Dad rief an – Grüße 🌿', text: 'Zeile eins\nZeile "zwei" ä ö ü ß geheimes-wort-xyz', tags: ['familie', 'abend'] });
  await r.create('2026-10-10', { mood: 2, title: '', text: 'Ruhiger Tag', tags: [] });
  return r.listAll();
};
const stripTimes = (a: StoredEntry[]) => a.map((s) => ({ id: s.id, day: s.day, entry: s.entry, c: s.createdAt, u: s.updatedAt }));

test('M1 an export reads back into the same entries', async () => {
  const items = await sample();
  const res = parseImport(exportJson(items, new Date()));
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.invalid, 0);
  const back = res.items.map((i) => ({ id: i.id, day: i.day, entry: i.entry, c: i.createdAt, u: i.updatedAt }));
  const key = (x: { id: string }) => x.id;
  assert.deepEqual([...back].sort((a, b) => key(a).localeCompare(key(b))), stripTimes(items).sort((a, b) => key(a).localeCompare(key(b))));
});

const good = (over: object = {}) => ({ id: 'abcdef0123456789', date: '2026-10-09', mood: 3, title: 't', text: 'x', tags: [], createdAt: '2026-10-09T10:00:00.000Z', updatedAt: '2026-10-09T10:00:00.000Z', ...over });
const file = (entries: unknown[], over: object = {}) => JSON.stringify({ app: 'Private Diary', format: 1, entries, ...over });

test('M2 refuses wrong files with a reason', () => {
  assert.deepEqual(parseImport('not json {'), { ok: false, reason: 'not-json' });
  assert.deepEqual(parseImport(JSON.stringify({ app: 'Other', format: 1, entries: [] })), { ok: false, reason: 'wrong-app' });
  assert.deepEqual(parseImport(file([good()], { format: 2 })), { ok: false, reason: 'wrong-format' });
  assert.deepEqual(parseImport(JSON.stringify({ app: 'Private Diary', format: 1 })), { ok: false, reason: 'no-entries' });
  assert.deepEqual(parseImport(JSON.stringify([1, 2])), { ok: false, reason: 'wrong-app' });
  assert.deepEqual(parseImport('x'.repeat(MAX_IMPORT_CHARS + 1)), { ok: false, reason: 'too-big' });
  const many = Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => good({ id: 'id' + String(i).padStart(10, '0') }));
  assert.deepEqual(parseImport(file(many)), { ok: false, reason: 'too-many' });
});

test('M2 bad single entries are skipped and counted; fixes for mood and tags', () => {
  const res = parseImport(
    file([
      good({ id: 'aaaaaaaa11111111' }),
      good({ id: 'bbbbbbbb22222222', date: '2026-13-40' }), // invalid date
      good({ id: 'cccccccc33333333', date: '2026-02-30' }), // not a real day
      good({ id: '' }),
      good({ id: 'dddddddd44444444', text: 5 }),
      good({ id: 'eeeeeeee55555555', mood: 9, tags: ['#a', 'A', 'b', 7, 'x'.repeat(50), ...Array.from({ length: 20 }, (_, i) => 'tag' + i)] }),
      good({ id: 'aaaaaaaa11111111' }), // duplicate id inside the file
      'a string',
      null,
      good({ id: 'ffffffff66666666', text: 'y'.repeat(200_001) }),
      good({ id: 'bad id with spaces' }),
    ]),
  );
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.deepEqual(res.items.map((i) => i.id), ['aaaaaaaa11111111', 'eeeeeeee55555555']);
  assert.equal(res.invalid, 9);
  const e = res.items[1].entry;
  assert.equal(e.mood, 3);
  assert.equal(e.tags.length, 10);
  assert.equal(e.tags[0], 'a');
  assert.ok(e.tags.every((t) => t.length <= 30));
});

test('M2 missing timestamps fall back to the given time', () => {
  const res = parseImport(file([good({ createdAt: undefined, updatedAt: 'garbage' })]), 123456);
  assert.ok(res.ok);
  if (res.ok) assert.deepEqual([res.items[0].createdAt, res.items[0].updatedAt], [123456, 123456]);
});

test('M3 import stores encrypted rows, skips known ids (also trashed), keeps their content', async () => {
  const items = await sample();
  const parsed = parseImport(exportJson(items, new Date()));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const db = memDb();
  const repo = await repoOf(db);
  const r1 = await repo.importEntries(parsed.items);
  assert.deepEqual(r1, { added: 2, skipped: 0 });
  const all = await repo.listAll();
  assert.equal(all.length, 2);
  const one = all.find((a) => a.day === '2026-10-09')!;
  assert.equal(one.createdAt, items.find((a) => a.day === '2026-10-09')!.createdAt);
  const raw = JSON.stringify(await db.all('SELECT * FROM entries'));
  assert.ok(!raw.includes('geheimes-wort-xyz') && !raw.includes('Ruhiger'), 'stored rows must not contain readable text');
  // changed copy of the file: known ids are not overwritten
  await repo.update(one.id, { ...one.entry, text: 'locally changed' });
  await repo.trash(all.find((a) => a.day === '2026-10-10')!.id);
  const r2 = await repo.importEntries(parsed.items);
  assert.deepEqual(r2, { added: 0, skipped: 2 });
  assert.equal((await repo.get(one.id))!.entry.text, 'locally changed');
  assert.equal((await repo.listTrash()).length, 1);
});

test('M4 import is all or nothing', async () => {
  const items = await sample();
  const parsed = parseImport(exportJson(items, new Date()));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const db = memDb(2); // the second insert fails
  const repo = await repoOf(db);
  await assert.rejects(() => repo.importEntries(parsed.items), /disk full/);
  assert.equal((await repo.listAll()).length, 0);
  assert.equal((await repo.listTrash()).length, 0);
});

test('M5 full round trip into a diary with another key', async () => {
  const items = await sample();
  const parsed = parseImport(exportJson(items, new Date()));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const other = await repoOf(memDb(), new Uint8Array(randomBytes(32)));
  await other.importEntries(parsed.items);
  const back = await other.listAll();
  const norm = (a: StoredEntry[]) => stripTimes(a).sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(norm(back), norm(items));
});

test('M3 preview: which ids are new', async () => {
  const items = await sample();
  const parsed = parseImport(exportJson(items, new Date()));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const repo = await repoOf(memDb());
  assert.equal((await repo.newIds(parsed.items.map((i) => i.id))).length, 2);
  await repo.importEntries(parsed.items.slice(0, 1));
  assert.equal((await repo.newIds(parsed.items.map((i) => i.id))).length, 1);
});
