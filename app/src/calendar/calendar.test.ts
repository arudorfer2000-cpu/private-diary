import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom } from '../crypto/diaryCrypto';
import type { Db } from '../storage/db';
import { EntryRepository, prepareSchema } from '../storage/entryRepository';
import {
  canGoNext, dayKey, daysInMonth, isFuture, leadingBlanks, monthKey, nextMonth, prevMonth, streak, todayOf, weekdayName,
} from './calendarMath';

configureRandom((n) => new Uint8Array(randomBytes(n)));

const D = (year: number, month: number, day: number) => ({ year, month, day });

test('K1 month grid: blanks (Monday first) and days in month', () => {
  const cases: [number, number, number, number][] = [
    [2026, 10, 3, 31], // Thu
    [2026, 3, 6, 31], // Sun
    [2026, 6, 0, 30], // Mon
    [2026, 2, 6, 28], // Sun
    [2024, 2, 3, 29], // leap, Thu
    [2100, 2, 0, 28], // not a leap year
    [2000, 2, 1, 29], // Tue, leap
    [2026, 12, 1, 31], // Tue
  ];
  for (const [year, month, blanks, days] of cases) {
    assert.equal(leadingBlanks({ year, month }), blanks, `blanks ${year}-${month}`);
    assert.equal(daysInMonth({ year, month }), days, `days ${year}-${month}`);
  }
});

test('K2 weekday names', () => {
  assert.equal(weekdayName(D(2026, 10, 11)), 'Sunday');
  assert.equal(weekdayName(D(2026, 1, 1)), 'Thursday');
  assert.equal(weekdayName(D(2024, 2, 29)), 'Thursday');
  assert.equal(weekdayName(D(2000, 1, 1)), 'Saturday');
});

test('K3 month navigation across year ends; next stops at the current month', () => {
  assert.deepEqual(prevMonth({ year: 2026, month: 1 }), { year: 2025, month: 12 });
  assert.deepEqual(prevMonth({ year: 2026, month: 10 }), { year: 2026, month: 9 });
  assert.deepEqual(nextMonth({ year: 2025, month: 12 }), { year: 2026, month: 1 });
  const today = { year: 2026, month: 10 };
  assert.equal(canGoNext({ year: 2026, month: 9 }, today), true);
  assert.equal(canGoNext({ year: 2026, month: 10 }, today), false);
  assert.equal(canGoNext({ year: 2025, month: 12 }, today), true);
  assert.equal(isFuture({ year: 2026, month: 10 }, 12, D(2026, 10, 11)), true);
  assert.equal(isFuture({ year: 2026, month: 10 }, 11, D(2026, 10, 11)), false);
  assert.equal(isFuture({ year: 2026, month: 9 }, 30, D(2026, 10, 11)), false);
});

test('K4 streak rules', () => {
  const today = D(2026, 10, 11);
  assert.equal(streak([], today), 0);
  assert.equal(streak(['2026-10-11'], today), 1);
  assert.equal(streak(['2026-10-09', '2026-10-10', '2026-10-11'], today), 3);
  assert.equal(streak(['2026-10-09', '2026-10-10'], today), 2, 'alive: yesterday written, today still open');
  assert.equal(streak(['2026-10-08', '2026-10-09'], today), 0, 'two days ago is too old');
  assert.equal(streak(['2026-10-08', '2026-10-10', '2026-10-11'], today), 2, 'gap ends it');
  assert.equal(streak(['2026-10-11', '2026-10-11', '2026-10-10'], today), 2, 'duplicates count once');
  assert.equal(streak(['2026-10-12', '2026-10-13'], today), 0, 'future days do not count');
  assert.equal(streak(['2026-09-29', '2026-09-30', '2026-10-01'], D(2026, 10, 1)), 3, 'across a month');
  assert.equal(streak(['2025-12-31', '2026-01-01'], D(2026, 1, 1)), 2, 'across a year');
  assert.equal(streak(['2024-02-28', '2024-02-29', '2024-03-01'], D(2024, 3, 1)), 3, 'across leap day');
});

test('K5 (TC-14) marked days equal saved entries', async () => {
  const d = new DatabaseSync(':memory:');
  const db: Db = {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
  await prepareSchema(db);
  const repo = new EntryRepository(db, new Uint8Array(randomBytes(32)));
  const saved = ['2026-10-01', '2026-10-11', '2026-10-31', '2026-09-30', '2026-11-01', '2025-10-15'];
  const ids: Record<string, string> = {};
  for (const day of saved) ids[day] = (await repo.create(day, { mood: 3, title: day, text: 'x', tags: [] })).id;

  const marked = async (ym: { year: number; month: number }) => (await repo.listMonth(monthKey(ym))).map((e) => e.day);
  assert.deepEqual(await marked({ year: 2026, month: 10 }), ['2026-10-01', '2026-10-11', '2026-10-31']);
  assert.deepEqual(await marked({ year: 2026, month: 9 }), ['2026-09-30']);
  assert.deepEqual(await marked({ year: 2026, month: 11 }), ['2026-11-01']);
  assert.deepEqual(await marked({ year: 2025, month: 10 }), ['2025-10-15']);
  assert.deepEqual(await marked({ year: 2026, month: 8 }), []);
  await repo.deletePermanently(ids['2026-10-11']);
  assert.deepEqual(await marked({ year: 2026, month: 10 }), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(await repo.listDays(), ['2025-10-15', '2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01']);
  assert.equal(dayKey(D(2026, 3, 5)), '2026-03-05');
});

test('K6 today is the local date, not UTC', () => {
  assert.deepEqual(todayOf(new Date(2026, 9, 11, 23, 30)), D(2026, 10, 11));
  assert.deepEqual(todayOf(new Date(2026, 9, 12, 0, 10)), D(2026, 10, 12));
  assert.deepEqual(todayOf(new Date(2026, 0, 1, 0, 0)), D(2026, 1, 1));
  assert.deepEqual(todayOf(new Date(2026, 11, 31, 23, 59)), D(2026, 12, 31));
});
