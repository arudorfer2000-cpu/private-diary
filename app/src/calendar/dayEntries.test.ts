import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByDay } from './dayEntries';
import type { StoredEntry } from '../storage/entryRepository';

const mk = (id: string, day: string, updatedAt: number, deletedAt: number | null = null): StoredEntry => ({ id, day, createdAt: 1, updatedAt, deletedAt, entry: { mood: 3, title: id, text: '', tags: [] } });

test('M1 groupByDay: newest first per day, trash excluded, other days apart', () => {
  const g = groupByDay([mk('a', '2026-10-05', 10), mk('b', '2026-10-05', 30), mk('c', '2026-10-05', 20), mk('t', '2026-10-05', 99, 5), mk('d', '2026-10-06', 1)]);
  assert.deepEqual(g[5].map((x) => x.id), ['b', 'c', 'a']);
  assert.deepEqual(g[6].map((x) => x.id), ['d']);
  assert.equal(g[7], undefined);
  assert.deepEqual(groupByDay([]), {});
});
