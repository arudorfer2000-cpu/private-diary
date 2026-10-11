import { cleanTags } from '../tags';
import type { Entry } from '../types';
import { parseDay } from '../calendar/calendarMath';

export const MAX_IMPORT_CHARS = 20 * 1024 * 1024;
export const MAX_ENTRIES = 50_000;
export const MAX_TEXT = 200_000;
export const MAX_TITLE = 200;

export type ImportItem = { id: string; day: string; createdAt: number; updatedAt: number; entry: Entry };
export type ImportFailure = 'wrong-csv' | 'not-json' | 'wrong-app' | 'wrong-format' | 'no-entries' | 'too-big' | 'too-many';
export type ParseResult = { ok: true; items: ImportItem[]; invalid: number } | { ok: false; reason: ImportFailure };

const ID = /^[A-Za-z0-9-]{8,64}$/;

function realDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseDay(s);
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day));
  return t.getUTCFullYear() === d.year && t.getUTCMonth() === d.month - 1 && t.getUTCDate() === d.day;
}

function ms(v: unknown, fallback: number): number {
  if (typeof v !== 'string') return fallback;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : fallback;
}

/**
 * Reads the JSON export of this app. Strict about the file (refused with a reason), forgiving about single entries
 * (bad ones are skipped and counted). Nothing here touches storage.
 */
export function parseImport(raw: string, now: number = Date.now()): ParseResult {
  if (raw.length > MAX_IMPORT_CHARS) return { ok: false, reason: 'too-big' };
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || (doc as { app?: unknown }).app !== 'Private Diary') return { ok: false, reason: 'wrong-app' };
  const o = doc as { format?: unknown; entries?: unknown };
  if (o.format !== 1) return { ok: false, reason: 'wrong-format' };
  if (!Array.isArray(o.entries)) return { ok: false, reason: 'no-entries' };
  if (o.entries.length > MAX_ENTRIES) return { ok: false, reason: 'too-many' };

  const seen = new Set<string>();
  const items: ImportItem[] = [];
  let invalid = 0;
  for (const e of o.entries as unknown[]) {
    const x = e && typeof e === 'object' && !Array.isArray(e) ? (e as Record<string, unknown>) : null;
    if (
      !x ||
      typeof x.id !== 'string' ||
      !ID.test(x.id) ||
      seen.has(x.id) ||
      !realDay(x.date) ||
      typeof x.text !== 'string' ||
      x.text.length > MAX_TEXT ||
      (x.title !== undefined && (typeof x.title !== 'string' || x.title.length > MAX_TITLE))
    ) {
      invalid++;
      continue;
    }
    seen.add(x.id);
    const created = ms(x.createdAt, now);
    items.push({
      id: x.id,
      day: x.date,
      createdAt: created,
      updatedAt: ms(x.updatedAt, created),
      entry: {
        mood: typeof x.mood === 'number' && Number.isInteger(x.mood) && x.mood >= 1 && x.mood <= 5 ? x.mood : 3,
        title: typeof x.title === 'string' ? x.title : '',
        text: x.text,
        tags: cleanTags(x.tags),
      },
    });
  }
  return { ok: true, items, invalid };
}
