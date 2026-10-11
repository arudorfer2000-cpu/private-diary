/** Calendar rules. Months are 1 to 12. Dates are plain "YYYY-MM-DD" strings in the phone's local time. */

export type YM = { year: number; month: number };
export type YMD = YM & { day: number };

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const monthKey = ({ year, month }: YM) => `${pad(year, 4)}-${pad(month)}`;
export const dayKey = ({ year, month, day }: YMD) => `${monthKey({ year, month })}-${pad(day)}`;

export function parseDay(key: string): YMD {
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), day: Number(key.slice(8, 10)) };
}

export function daysInMonth({ year, month }: YM): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday({ year, month, day }: YMD): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export const weekdayName = (d: YMD) => WEEKDAY_NAMES[weekday(d)];

/** Blank cells before day 1 when the week starts on Monday. */
export function leadingBlanks(ym: YM): number {
  return (weekday({ ...ym, day: 1 }) + 6) % 7;
}

/** The phone's local date (not UTC). */
export function todayOf(now: Date): YMD {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function prevMonth({ year, month }: YM): YM {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth({ year, month }: YM): YM {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

const cmp = (a: YM, b: YM) => a.year * 12 + a.month - (b.year * 12 + b.month);

/** Going forward stops at the current month: there is nothing to write in the future. */
export function canGoNext(view: YM, today: YM): boolean {
  return cmp(view, today) < 0;
}

export function isFuture(view: YM, day: number, today: YMD): boolean {
  const c = cmp(view, today);
  return c > 0 || (c === 0 && day > today.day);
}

function previousDay(d: YMD): YMD {
  if (d.day > 1) return { ...d, day: d.day - 1 };
  const pm = prevMonth(d);
  return { ...pm, day: daysInMonth(pm) };
}

/**
 * Days in a row with an entry, counted back from today. If today is still empty but
 * yesterday is written, the streak is still alive and counts from yesterday.
 */
export function streak(writtenDays: Iterable<string>, today: YMD): number {
  const set = new Set(writtenDays);
  let d = today;
  if (!set.has(dayKey(d))) d = previousDay(d);
  let n = 0;
  while (set.has(dayKey(d))) {
    n++;
    d = previousDay(d);
  }
  return n;
}
