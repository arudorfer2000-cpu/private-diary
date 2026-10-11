import type { StoredEntry } from '../storage/entryRepository';
import { dayKey, type YMD } from '../calendar/calendarMath';

export type SearchFilters = {
  query: string;
  /** Empty = any mood. */
  moods: number[];
  /** Exact tag (any letter case), or null. */
  tag: string | null;
  /** First and last day to include ("YYYY-MM-DD", inclusive). Missing or null = no limit. */
  from?: string | null;
  to?: string | null;
};

export type DatePreset = 'any' | '7d' | '30d' | 'year';

/** Date range for a preset, counted back from today (today included). */
export function presetRange(p: DatePreset, today: YMD): { from: string | null; to: string | null } {
  if (p === 'any') return { from: null, to: null };
  if (p === 'year') return { from: `${String(today.year).padStart(4, '0')}-01-01`, to: dayKey(today) };
  const back = (p === '7d' ? 6 : 29) * 86_400_000;
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day) - back);
  const from = dayKey({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
  return { from, to: dayKey(today) };
}

/** Lower case, accents removed: "Café" and "cafe" match. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

function words(q: string): string[] {
  return normalize(q).split(/\s+/).filter(Boolean);
}

export function matches(item: StoredEntry, f: SearchFilters): boolean {
  const { entry } = item;
  if (f.from && item.day < f.from) return false;
  if (f.to && item.day > f.to) return false;
  if (f.moods.length > 0 && !f.moods.includes(entry.mood)) return false;
  if (f.tag !== null) {
    const t = normalize(f.tag);
    if (!entry.tags.some((x) => normalize(x) === t)) return false;
  }
  const ws = words(f.query);
  if (ws.length === 0) return true;
  const hay = normalize(`${entry.title}\n${entry.text}\n${entry.tags.join(' ')}`);
  return ws.every((w) => hay.includes(w));
}

/** Newest day first; on the same day the most recently edited first. */
export function searchEntries(items: StoredEntry[], f: SearchFilters): StoredEntry[] {
  return items
    .filter((i) => i.deletedAt === null && matches(i, f))
    .sort((a, b) => (a.day === b.day ? b.updatedAt - a.updatedAt : a.day < b.day ? 1 : -1));
}

/** A short piece of the text around the first matching word, or the start of the text. */
export function snippet(text: string, query: string, max = 110): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const norm = normalize(flat);
  // normalize() can change length only for exotic characters; fall back to the start if it did
  let at = -1;
  if (norm.length === flat.length) {
    for (const w of words(query)) {
      const i = norm.indexOf(w);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
  }
  if (at < 0) return flat.length > max ? flat.slice(0, max).trimEnd() + '…' : flat;
  const start = Math.max(0, at - 30);
  const end = Math.min(flat.length, start + max);
  return (start > 0 ? '…' : '') + flat.slice(start, end).trim() + (end < flat.length ? '…' : '');
}

/** Tags with counts, most used first, ties alphabetical. The first spelling seen is shown. */
export function allTags(items: StoredEntry[]): { tag: string; count: number }[] {
  const map = new Map<string, { tag: string; count: number }>();
  for (const i of items) {
    if (i.deletedAt !== null) continue;
    for (const t of i.entry.tags) {
      const k = normalize(t);
      const cur = map.get(k);
      if (cur) cur.count++;
      else map.set(k, { tag: t, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
