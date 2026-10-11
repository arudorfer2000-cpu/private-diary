import type { StoredEntry } from '../storage/entryRepository';

/** Entries of one month by day of month. Newest-updated first, so the first one is the one the calendar shows and opens. */
export function groupByDay(items: StoredEntry[]): Record<number, StoredEntry[]> {
  const out: Record<number, StoredEntry[]> = {};
  for (const s of items) {
    if (s.deletedAt !== null) continue;
    (out[Number(s.day.slice(8, 10))] ??= []).push(s);
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
  return out;
}
