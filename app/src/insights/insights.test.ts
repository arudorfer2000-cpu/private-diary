import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StoredEntry } from '../storage/entryRepository';
import { computeInsights, countWords } from './insights';

let n = 0;
const mk = (day: string, mood: number, text: string, tags: string[] = [], deletedAt: number | null = null): StoredEntry => ({
  id: 'id' + ++n, day, createdAt: n, updatedAt: n, deletedAt, entry: { mood, title: '', text, tags },
});
const today = { year: 2026, month: 10, day: 11 };

const sample = [
  mk('2026-10-11', 4, 'one two three', ['a']),
  mk('2026-10-10', 2, 'one two', ['a', 'b']),
  mk('2026-10-09', 5, 'one', ['b']),
  mk('2026-10-05', 3, 'one two three four'),
  mk('2026-09-30', 1, 'one two three four five', ['a']),
  mk('2025-10-20', 4, 'one two'),
  mk('2026-01-15', 3, ''),
  mk('2026-10-08', 5, 'trashed entry', [], 99),
];

test('I1 insights on a hand-checked sample', () => {
  const r = computeInsights(sample, today);
  assert.equal(r.totalEntries, 7);
  assert.equal(r.totalWords, 17);
  assert.equal(r.avgWords, 2.4);
  assert.equal(r.currentStreak, 3);
  assert.equal(r.longestStreak, 3);
  assert.equal(r.perMonth.length, 12);
  assert.equal(r.perMonth[0].month, '2025-11');
  assert.equal(r.perMonth[11].month, '2026-10');
  assert.deepEqual(Object.fromEntries(r.perMonth.filter((m) => m.count > 0).map((m) => [m.month, m.count])), { '2026-10': 4, '2026-09': 1, '2026-01': 1 });
  assert.equal(r.moodByWeek.length, 12);
  assert.equal(r.moodByWeek[11].weekStart, '2026-10-05');
  assert.deepEqual([r.moodByWeek[11].avg, r.moodByWeek[11].count], [3.5, 4]);
  assert.deepEqual([r.moodByWeek[10].weekStart, r.moodByWeek[10].avg, r.moodByWeek[10].count], ['2026-09-28', 1, 1]);
  assert.equal(r.moodByWeek[0].weekStart, '2026-07-20');
  assert.equal(r.moodByWeek[0].avg, null);
  assert.deepEqual(r.moodCounts, { 1: 1, 2: 1, 3: 2, 4: 2, 5: 1 });
  assert.deepEqual(r.topTags, [
    { tag: 'a', count: 3, avgMood: 2.3 },
    { tag: 'b', count: 2, avgMood: 3.5 },
  ]);
});

test('I1 empty diary and streak alive from yesterday', () => {
  const e = computeInsights([], today);
  assert.deepEqual([e.totalEntries, e.totalWords, e.avgWords, e.currentStreak, e.longestStreak, e.topTags.length], [0, 0, 0, 0, 0, 0]);
  assert.equal(e.perMonth.length, 12);
  assert.ok(e.moodByWeek.every((w) => w.avg === null));
  const y = computeInsights([mk('2026-10-10', 3, 'x'), mk('2026-10-09', 3, 'x')], today);
  assert.equal(y.currentStreak, 2);
});

test('I1 longest streak can be in the past; two entries on one day count once for streaks', () => {
  const items = [mk('2026-03-01', 3, 'a'), mk('2026-03-02', 3, 'a'), mk('2026-03-02', 3, 'b'), mk('2026-03-03', 3, 'a'), mk('2026-03-04', 3, 'a'), mk('2026-10-11', 3, 'a')];
  const r = computeInsights(items, today);
  assert.equal(r.longestStreak, 4);
  assert.equal(r.currentStreak, 1);
});

test('I2 words are counted in any language; emoji and punctuation are not words', () => {
  assert.equal(countWords('Grüße 🌿 !!! 42'), 2);
  assert.equal(countWords("It's a café — naïve façade"), 5);
  assert.equal(countWords('Привет мир'), 2);
  assert.equal(countWords('東京 は 晴れ'), 3);
  assert.equal(countWords('  \n\t '), 0);
  assert.equal(countWords('😀😀 😀'), 0);
  assert.equal(countWords('a-b c_d'), 2);
});
