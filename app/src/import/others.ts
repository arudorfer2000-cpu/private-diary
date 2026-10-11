import { cleanTags } from '../tags';
import type { Entry } from '../types';
import { MAX_ENTRIES, MAX_IMPORT_CHARS, MAX_TEXT, MAX_TITLE, parseImport, type ImportItem, type ParseResult } from './importer';

/**
 * Importers for two other diary apps. They are written from the documented export layouts and were only tried on
 * synthetic samples, never on a real export (see checks.md D11). Text is only read as data, nothing is executed.
 */

/** RFC 4180 style CSV: quoted fields may hold commas, doubled quotes and line breaks. Returns null for broken quoting. */
export function parseCsv(raw: string): string[][] | null {
  const text = raw.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
    i++;
  }
  if (quoted) return null;
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const DAYLIO_MOOD: Record<string, number> = { awful: 1, bad: 2, meh: 3, good: 4, rad: 5 };
const pad = (n: number) => String(n).padStart(2, '0');

function validYmd(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function clock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    h = h % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  }
  return h < 24 && min < 60 ? h * 60 + min : null;
}

type Day = { day: string; moods: number[]; tags: string[]; parts: { at: number; title: string; note: string }[] };

/** Daylio CSV: one entry per day (several rows of one day are merged, nothing is dropped). */
export function parseDaylio(raw: string): ParseResult {
  if (raw.length > MAX_IMPORT_CHARS) return { ok: false, reason: 'too-big' };
  const rows = parseCsv(raw);
  if (!rows || rows.length === 0) return { ok: false, reason: 'wrong-csv' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  const [cDate, cTime, cMood, cAct, cTitle, cNote] = ['full_date', 'time', 'mood', 'activities', 'note_title', 'note'].map(col);
  if (cDate < 0 || cMood < 0) return { ok: false, reason: 'wrong-csv' };
  if (rows.length - 1 > MAX_ENTRIES) return { ok: false, reason: 'too-many' };
  const days = new Map<string, Day>();
  let invalid = 0;
  for (const r of rows.slice(1)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((r[cDate] ?? '').trim());
    const day = m ? validYmd(Number(m[1]), Number(m[2]), Number(m[3])) : null;
    const note = (cNote >= 0 ? r[cNote] ?? '' : '').replace(/\r\n?/g, '\n');
    const title = cTitle >= 0 ? r[cTitle] ?? '' : '';
    if (!day || note.length > MAX_TEXT || title.length > MAX_TITLE) {
      invalid++;
      continue;
    }
    const d = days.get(day) ?? { day, moods: [], tags: [], parts: [] };
    d.moods.push(DAYLIO_MOOD[(r[cMood] ?? '').trim().toLowerCase()] ?? 3);
    if (cAct >= 0) for (const a of (r[cAct] ?? '').split('|')) d.tags.push(a);
    d.parts.push({ at: cTime >= 0 ? clock(r[cTime] ?? '') ?? 0 : 0, title: title.trim(), note: note.trim() });
    days.set(day, d);
  }
  const items: ImportItem[] = [];
  for (const d of [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1))) {
    const parts = d.parts.sort((a, b) => a.at - b.at);
    const title = parts.find((p) => p.title)?.title ?? '';
    const text = parts
      .map((p) => (parts.length > 1 && p.title && p.title !== title ? `${p.title}\n${p.note}` : p.note))
      .filter((x) => x)
      .join('\n\n')
      .slice(0, MAX_TEXT);
    const [y, mo, da] = d.day.split('-').map(Number);
    const created = Date.UTC(y, mo - 1, da, 12);
    items.push({
      id: `daylio-${d.day}`,
      day: d.day,
      createdAt: created,
      updatedAt: created,
      entry: { mood: Math.min(5, Math.max(1, Math.round(d.moods.reduce((a, b) => a + b, 0) / d.moods.length))), title, text, tags: cleanTags(d.tags) } as Entry,
    });
  }
  return { ok: true, items, invalid };
}

/** Calendar day of an instant in the entry's own time zone; falls back to UTC if the zone is unknown. */
function localDay(iso: string, zone: unknown): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  if (typeof zone === 'string' && zone) {
    try {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
      if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    } catch {
      // unknown zone: use UTC below
    }
  }
  return new Date(t).toISOString().slice(0, 10);
}

/** Day One writes markdown with backslash escapes such as `\.` and `\-`. */
const unescapeMd = (s: string) => s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, '$1');

export function looksLikeDayOne(doc: unknown): boolean {
  const e = doc && typeof doc === 'object' ? (doc as { entries?: unknown }).entries : null;
  return Array.isArray(e) && e.length > 0 && e.every((x) => x && typeof x === 'object' && typeof (x as { uuid?: unknown }).uuid === 'string' && typeof (x as { creationDate?: unknown }).creationDate === 'string');
}

/** Day One JSON export (entries[] with uuid, creationDate, text, tags). */
export function parseDayOne(doc: unknown): ParseResult {
  const list = (doc as { entries?: unknown }).entries;
  if (!Array.isArray(list)) return { ok: false, reason: 'no-entries' };
  if (list.length > MAX_ENTRIES) return { ok: false, reason: 'too-many' };
  const items: ImportItem[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  for (const e of list as Record<string, unknown>[]) {
    const uuid = typeof e?.uuid === 'string' ? e.uuid.replace(/[^A-Za-z0-9]/g, '') : '';
    const day = typeof e?.creationDate === 'string' ? localDay(e.creationDate, e.timeZone) : null;
    const rawText = typeof e?.text === 'string' ? e.text : '';
    if (uuid.length < 8 || uuid.length > 56 || !day || seen.has(uuid) || rawText.length > MAX_TEXT) {
      invalid++;
      continue;
    }
    seen.add(uuid);
    const lines = unescapeMd(rawText.replace(/\r\n?/g, '\n')).split('\n');
    let title = '';
    if (/^#{1,3}\s+\S/.test(lines[0] ?? '')) {
      title = lines.shift()!.replace(/^#+\s+/, '').trim().slice(0, MAX_TITLE);
    }
    const text = lines.join('\n').trim();
    if (!title && !text) {
      invalid++;
      continue;
    }
    const created = Date.parse(e.creationDate as string);
    const modified = typeof e.modifiedDate === 'string' && Number.isFinite(Date.parse(e.modifiedDate)) ? Date.parse(e.modifiedDate) : created;
    items.push({ id: `dayone-${uuid}`, day, createdAt: created, updatedAt: modified, entry: { mood: 3, title, text, tags: cleanTags(e.tags) } });
  }
  return { ok: true, items, invalid };
}

/** Finds out what the file is from its content and reads it. */
export function parseAnyImport(raw: string, now: number = Date.now()): ParseResult {
  if (raw.length > MAX_IMPORT_CHARS) return { ok: false, reason: 'too-big' };
  const first = raw.replace(/^﻿/, '').trimStart()[0];
  if (first === '{' || first === '[') {
    let doc: unknown;
    try {
      doc = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'not-json' };
    }
    if (looksLikeDayOne(doc)) return parseDayOne(doc);
    return parseImport(raw, now);
  }
  const firstLine = raw.replace(/^﻿/, '').split(/\r?\n/, 1)[0].toLowerCase();
  if (firstLine.includes('full_date')) return parseDaylio(raw);
  return parseImport(raw, now); // reports not-json
}
