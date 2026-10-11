import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom } from '../crypto/diaryCrypto';
import type { Db } from '../storage/db';
import { EntryRepository, prepareSchema, type StoredEntry } from '../storage/entryRepository';
import { allTags, searchEntries, snippet, type SearchFilters } from './search';

configureRandom((n) => new Uint8Array(randomBytes(n)));

const F = (over: Partial<SearchFilters> = {}): SearchFilters => ({ query: '', moods: [], tag: null, ...over });

function item(id: string, day: string, mood: number, title: string, text: string, tags: string[] = [], updatedAt = 1, deletedAt: number | null = null): StoredEntry {
  return { id, day, createdAt: 1, updatedAt, deletedAt, entry: { mood, title, text, tags } };
}

const SET = [
  item('a', '2026-10-01', 3, 'Coffee with Anna', 'We met at the café near the river.', ['friends']),
  item('b', '2026-10-05', 1, 'Bad night', 'Could not sleep. Thinking about the move to Zürich.', ['sleep', 'Work']),
  item('c', '2026-10-05', 5, 'Great hike', 'Mountains, sun and silence. Über den Wolken.', ['Family', 'outdoors'], 9),
  item('d', '2026-09-20', 4, 'Dad called', 'Long talk about the old house.', ['family']),
  item('e', '2026-10-09', 2, 'Gone', 'Secret in the trash.', ['family'], 1, 12345),
];

test('Q1 query: title, text, tags; all words in any order; case and accents ignored; empty lists all', () => {
  const ids = (f: SearchFilters) => searchEntries(SET, f).map((x) => x.id);
  assert.deepEqual(ids(F({ query: 'anna' })), ['a'], 'title');
  assert.deepEqual(ids(F({ query: 'RIVER' })), ['a'], 'text, upper case');
  assert.deepEqual(ids(F({ query: 'outdoors' })), ['c'], 'tag');
  assert.deepEqual(ids(F({ query: 'cafe' })), ['a'], 'accent in text');
  assert.deepEqual(ids(F({ query: 'zurich' })), ['b']);
  assert.deepEqual(ids(F({ query: 'uber wolken' })), ['c'], 'two words');
  assert.deepEqual(ids(F({ query: 'wolken uber' })), ['c'], 'other order');
  assert.deepEqual(ids(F({ query: 'sun river' })), [], 'all words must match');
  assert.deepEqual(ids(F({ query: '   ' })), ids(F()), 'blank query = empty query');
  assert.equal(ids(F()).length, 4, 'empty query lists all non-trashed');
  assert.deepEqual(ids(F({ query: 'nonexistentword' })), []);
});

test('Q2 filters alone and combined', () => {
  const ids = (f: SearchFilters) => searchEntries(SET, f).map((x) => x.id).sort();
  assert.deepEqual(ids(F({ moods: [1] })), ['b']);
  assert.deepEqual(ids(F({ moods: [1, 5] })), ['b', 'c']);
  assert.deepEqual(ids(F({ tag: 'FAMILY' })), ['c', 'd'], 'tag any case, trashed e excluded');
  assert.deepEqual(ids(F({ tag: 'work' })), ['b']);
  assert.deepEqual(ids(F({ tag: 'fam' })), [], 'tag is exact, not a prefix');
  assert.deepEqual(ids(F({ tag: 'family', moods: [4] })), ['d']);
  assert.deepEqual(ids(F({ tag: 'family', query: 'house' })), ['d']);
  assert.deepEqual(ids(F({ tag: 'family', query: 'house', moods: [5] })), []);
});

test('Q3 newest day first, ties by last edit; trash never found', () => {
  const r = searchEntries(SET, F()).map((x) => x.id);
  assert.deepEqual(r, ['c', 'b', 'a', 'd'], 'day 10-05 (c edited later than b) before 10-01 before 09-20');
  assert.ok(!searchEntries(SET, F({ query: 'secret' })).length, 'trashed text not found');
});

test('Q4 snippet', () => {
  const long = 'x '.repeat(100) + 'the needle is here ' + 'y '.repeat(100);
  const s = snippet(long, 'needle');
  assert.ok(s.includes('needle'));
  assert.ok(s.length <= 115);
  assert.ok(s.startsWith('…') && s.endsWith('…'));
  assert.equal(snippet('Short text.', 'zzz'), 'Short text.', 'no match in text: start of text');
  const start = snippet('word '.repeat(60), 'nothing');
  assert.ok(start.endsWith('…') && start.length <= 112);
  assert.ok(snippet('Un café noir', 'CAFE').includes('café'), 'accent-insensitive');
  assert.equal(snippet('line one\n\nline   two', 'two'), 'line one line two');
});

test('Q5 tag counts', () => {
  assert.deepEqual(allTags(SET), [
    { tag: 'Family', count: 2 },
    { tag: 'friends', count: 1 },
    { tag: 'outdoors', count: 1 },
    { tag: 'sleep', count: 1 },
    { tag: 'Work', count: 1 },
  ]);
});

test('Q6 listAll decrypts everything, excludes trash; 300 entries search under 500 ms', async () => {
  const d = new DatabaseSync(':memory:');
  const db: Db = {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
  await prepareSchema(db);
  const repo = new EntryRepository(db, new Uint8Array(randomBytes(32)));
  let trashId = '';
  for (let i = 0; i < 300; i++) {
    const day = `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;
    const e = await repo.create(day, { mood: 1 + (i % 5), title: `Entry ${i}`, text: `Some thoughts number ${i} about ${i % 7 === 0 ? 'needle' : 'hay'}`, tags: [`t${i % 5}`] });
    if (i === 10) trashId = e.id;
  }
  await repo.trash(trashId);
  const t0 = performance.now();
  const all = await repo.listAll();
  const found = searchEntries(all, F({ query: 'needle' }));
  const ms = performance.now() - t0;
  assert.equal(all.length, 299);
  assert.ok(all.every((x) => x.entry.title.startsWith('Entry ')), 'none skipped or garbled');
  assert.equal(found.length, 43 - (10 % 7 === 0 ? 1 : 0), 'multiples of 7 below 300 = 43; entry 10 is not one');
  assert.ok(ms < 500, `took ${ms.toFixed(0)} ms`);
  console.log(`# info: load + search of 300 entries took ${ms.toFixed(0)} ms in Node`);
});

import { presetRange } from './search';

test('R1 date range is inclusive, combines with other filters; presets count back from today', () => {
  const mk = (id: string, day: string, mood: number, text: string): StoredEntry => ({ id, day, createdAt: 1, updatedAt: 1, deletedAt: null, entry: { mood, title: '', text, tags: [] } });
  const set = [mk('a', '2026-10-11', 4, 'alpha'), mk('b', '2026-10-05', 2, 'alpha beta'), mk('c', '2026-10-04', 3, 'beta'), mk('d', '2026-01-01', 3, 'alpha'), mk('e', '2025-12-31', 3, 'alpha')];
  const ids = (f: Partial<SearchFilters>) => searchEntries(set, { query: '', moods: [], tag: null, ...f }).map((x) => x.id);
  assert.deepEqual(ids({ from: '2026-10-05', to: '2026-10-11' }), ['a', 'b']); // both ends included
  assert.deepEqual(ids({ from: '2026-10-05' }), ['a', 'b']);
  assert.deepEqual(ids({ to: '2026-10-04' }), ['c', 'd', 'e']);
  assert.deepEqual(ids({ from: '2026-10-05', query: 'beta' }), ['b']);
  assert.deepEqual(ids({ from: '2026-10-01', moods: [4] }), ['a']);
  const today = { year: 2026, month: 10, day: 11 };
  assert.deepEqual(presetRange('any', today), { from: null, to: null });
  assert.deepEqual(presetRange('7d', today), { from: '2026-10-05', to: '2026-10-11' });
  assert.deepEqual(presetRange('30d', today), { from: '2026-09-12', to: '2026-10-11' });
  assert.deepEqual(presetRange('year', today), { from: '2026-01-01', to: '2026-10-11' });
  assert.deepEqual(presetRange('7d', { year: 2026, month: 1, day: 3 }), { from: '2025-12-28', to: '2026-01-03' }); // across new year
  assert.deepEqual(ids(presetRange('year', today)), ['a', 'b', 'c', 'd']);
});
