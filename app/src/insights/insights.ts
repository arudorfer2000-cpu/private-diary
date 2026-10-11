import type { StoredEntry } from '../storage/entryRepository';
import { parseDay, streak, weekday, type YMD } from '../calendar/calendarMath';

export type Insights = {
  totalEntries: number;
  totalWords: number;
  avgWords: number; // one decimal
  currentStreak: number;
  longestStreak: number;
  /** Last 12 months ending with the current one, oldest first. */
  perMonth: { month: string; count: number }[];
  /** Last 12 weeks (Monday start) ending with the current week, oldest first. avg is null without entries. */
  moodByWeek: { weekStart: string; avg: number | null; count: number }[];
  moodCounts: Record<number, number>;
  /** Most used tags (at most 8), with the average mood of their entries (one decimal). */
  topTags: { tag: string; count: number; avgMood: number }[];
};

const WORD_CHAR = /[0-9A-Za-zÀ-ɏͰ-῿぀-鿿가-힯]/;

/** Words are runs between spaces that contain a letter or digit of any common script. Emoji and punctuation alone are not words. */
export function countWords(text: string): number {
  let n = 0;
  for (const tok of text.split(/\s+/)) if (tok && WORD_CHAR.test(tok)) n++;
  return n;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const pad = (n: number) => String(n).padStart(2, '0');
const ymdToUtc = (d: YMD) => Date.UTC(d.year, d.month - 1, d.day);
const utcToKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const DAY = 86_400_000;

/** Monday of the week that contains this day, as a UTC timestamp. */
const mondayOf = (d: YMD) => ymdToUtc(d) - ((weekday(d) + 6) % 7) * DAY;

export function computeInsights(all: StoredEntry[], today: YMD): Insights {
  const items = all.filter((i) => i.deletedAt === null);
  const totalWords = items.reduce((s, i) => s + countWords(i.entry.text), 0);

  const days = [...new Set(items.map((i) => i.day))].sort();
  let longest = 0;
  let run = 0;
  let prev = NaN;
  for (const k of days) {
    const t = ymdToUtc(parseDay(k));
    run = t - prev === DAY ? run + 1 : 1;
    prev = t;
    if (run > longest) longest = run;
  }

  const perMonth: Insights['perMonth'] = [];
  for (let i = 11; i >= 0; i--) {
    const idx = today.year * 12 + (today.month - 1) - i;
    perMonth.push({ month: `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`, count: 0 });
  }
  const monthAt = new Map(perMonth.map((m) => [m.month, m]));
  for (const i of items) {
    const m = monthAt.get(i.day.slice(0, 7));
    if (m) m.count++;
  }

  const thisMonday = mondayOf(today);
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: thisMonday - (11 - i) * 7 * DAY, sum: 0, count: 0 }));
  for (const i of items) {
    const m = mondayOf(parseDay(i.day));
    const w = weeks.find((x) => x.start === m);
    if (w) {
      w.sum += i.entry.mood;
      w.count++;
    }
  }

  const moodCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const tagMap = new Map<string, { tag: string; count: number; sum: number }>();
  for (const i of items) {
    if (i.entry.mood >= 1 && i.entry.mood <= 5) moodCounts[i.entry.mood]++;
    for (const tg of i.entry.tags) {
      const k = tg.toLocaleLowerCase();
      const cur = tagMap.get(k) ?? { tag: tg, count: 0, sum: 0 };
      cur.count++;
      cur.sum += i.entry.mood;
      tagMap.set(k, cur);
    }
  }

  return {
    totalEntries: items.length,
    totalWords,
    avgWords: items.length ? round1(totalWords / items.length) : 0,
    currentStreak: streak(days, today),
    longestStreak: longest,
    perMonth,
    moodByWeek: weeks.map((w) => ({ weekStart: utcToKey(w.start), avg: w.count ? round1(w.sum / w.count) : null, count: w.count })),
    moodCounts,
    topTags: [...tagMap.values()]
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, 8)
      .map((t) => ({ tag: t.tag, count: t.count, avgMood: round1(t.sum / t.count) })),
  };
}
