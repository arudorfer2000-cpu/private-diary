import { decryptBytes, decryptEntry, encryptBytes, encryptEntry, newId } from '../crypto/diaryCrypto';
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from '../photos/base64';
import { cleanPlace } from '../place/place';
import type { Entry } from '../types';
import { cleanTags } from '../tags';
import type { Db } from './db';

/** Day format: "YYYY-MM-DD". Clear on purpose (the calendar needs it); the content is never clear. */
export type StoredEntry = {
  id: string;
  day: string;
  createdAt: number;
  updatedAt: number;
  /** When it was moved to the trash, or null. */
  deletedAt: number | null;
  entry: Entry;
};

export const TRASH_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PHOTO_ID = /^[A-Za-z0-9-]{8,64}$/;

export type PhotoResult = { ok: true; id: string } | { ok: false; reason: 'too-big' | 'limit' | 'empty' };

type Row = { id: string; day: string; created_at: number; updated_at: number; deleted_at: number | null; payload: string };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_day ON entries(day);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_entry ON photos(entry_id);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

const RECOVERY_KEY = 'recovery_blob';

export async function prepareSchema(db: Db): Promise<void> {
  await db.exec(SCHEMA);
  // Databases made before the trash existed have no deleted_at column yet.
  const cols = await db.all<{ name: string }>('PRAGMA table_info(entries)');
  if (!cols.some((c) => c.name === 'deleted_at')) {
    await db.exec('ALTER TABLE entries ADD COLUMN deleted_at INTEGER');
  }
}

/** Meta needs no data key: it holds only already-encrypted material. */
export async function saveRecoveryBlob(db: Db, blob: string): Promise<void> {
  await db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [RECOVERY_KEY, blob]);
}

export async function loadRecoveryBlob(db: Db): Promise<string | null> {
  const rows = await db.all<{ value: string }>('SELECT value FROM meta WHERE key = ?', [RECOVERY_KEY]);
  return rows.length ? rows[0].value : null;
}

/** Entries are sealed with the data key. The entry id is bound in, so a payload cannot be moved to another row. */
export class EntryRepository {
  constructor(
    private db: Db,
    private dataKey: Uint8Array,
    private now: () => number = Date.now,
  ) {}

  private open(row: Row): StoredEntry {
    const raw = JSON.parse(decryptEntry(this.dataKey, row.id, row.payload)) as Partial<Entry>;
    const entry: Entry = { mood: raw.mood ?? 3, title: raw.title ?? '', text: raw.text ?? '', tags: cleanTags(raw.tags) };
    const photos = Array.isArray(raw.photos) ? raw.photos.filter((p): p is string => typeof p === 'string' && PHOTO_ID.test(p)).slice(0, MAX_PHOTOS) : [];
    if (photos.length) entry.photos = photos;
    const place = cleanPlace(raw.place);
    if (place) entry.place = place;
    return { id: row.id, day: row.day, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at ?? null, entry };
  }

  async create(day: string, entry: Entry): Promise<StoredEntry> {
    const id = newId();
    const t = this.now();
    const payload = encryptEntry(this.dataKey, id, JSON.stringify(entry));
    await this.db.run('INSERT INTO entries (id, day, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?)', [id, day, t, t, payload]);
    await this.linkPhotos(id, entry.photos ?? []);
    return { id, day, createdAt: t, updatedAt: t, deletedAt: null, entry };
  }

  // ---- photos: sealed bytes in their own table; the entry only lists their ids ----

  /** Seals and stores one photo. It belongs to no entry yet; saving the entry that lists it links it. */
  async addPhoto(bytes: Uint8Array, countAlready: number): Promise<PhotoResult> {
    if (bytes.length === 0) return { ok: false, reason: 'empty' };
    if (countAlready >= MAX_PHOTOS) return { ok: false, reason: 'limit' };
    if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: 'too-big' };
    const id = newId();
    await this.db.run('INSERT INTO photos (id, entry_id, created_at, payload) VALUES (?, ?, ?, ?)', [id, '', this.now(), encryptBytes(this.dataKey, id, bytes)]);
    return { ok: true, id };
  }

  async getPhoto(id: string): Promise<Uint8Array | null> {
    const rows = await this.db.all<{ payload: string }>('SELECT payload FROM photos WHERE id = ?', [id]);
    return rows.length ? decryptBytes(this.dataKey, id, rows[0].payload) : null;
  }

  /** Marks these photos as belonging to the entry (photos of another entry are never taken over). */
  private async linkPhotos(entryId: string, ids: string[]): Promise<void> {
    for (const pid of ids.slice(0, MAX_PHOTOS)) {
      await this.db.run("UPDATE photos SET entry_id = ? WHERE id = ? AND (entry_id = '' OR entry_id = ?)", [entryId, pid, entryId]);
    }
  }

  /** Deletes the entry's photos that are not in `keep`. Called when an edit is finished or discarded, never while typing. */
  async prunePhotos(entryId: string, keep: string[]): Promise<void> {
    const rows = await this.db.all<{ id: string }>('SELECT id FROM photos WHERE entry_id = ?', [entryId]);
    for (const r of rows) if (!keep.includes(r.id)) await this.db.run('DELETE FROM photos WHERE id = ?', [r.id]);
  }

  /** Photos that were picked but never saved with an entry (app closed in between). Run at unlock, when no editor is open. */
  async purgeUnlinkedPhotos(): Promise<void> {
    await this.db.run("DELETE FROM photos WHERE entry_id = ''");
  }

  /** Which of these ids are not in the diary yet (the trash counts as "in the diary"). Reads ids only, nothing is decrypted. */
  async newIds(ids: string[]): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>('SELECT id FROM entries');
    const have = new Set(rows.map((r) => r.id));
    return ids.filter((id) => !have.has(id));
  }

  /**
   * Adds entries from an import file with their original id, day and times. Known ids are skipped and never overwritten.
   * All or nothing: if anything fails, none of this batch stays.
   */
  async importEntries(items: { id: string; day: string; createdAt: number; updatedAt: number; entry: Entry }[]): Promise<{ added: number; skipped: number }> {
    const fresh = new Set(await this.newIds(items.map((i) => i.id)));
    let added = 0;
    await this.db.exec('BEGIN');
    try {
      for (const it of items) {
        if (!fresh.has(it.id)) continue;
        const payload = encryptEntry(this.dataKey, it.id, JSON.stringify(it.entry));
        await this.db.run('INSERT INTO entries (id, day, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?)', [it.id, it.day, it.createdAt, it.updatedAt, payload]);
        added++;
      }
      await this.db.exec('COMMIT');
    } catch (e) {
      try {
        await this.db.exec('ROLLBACK');
      } catch {
        // already rolled back by the database
      }
      throw e;
    }
    return { added, skipped: items.length - added };
  }

  async update(id: string, entry: Entry): Promise<void> {
    const t = this.now();
    const payload = encryptEntry(this.dataKey, id, JSON.stringify(entry));
    await this.db.run('UPDATE entries SET payload = ?, updated_at = ? WHERE id = ?', [payload, t, id]);
    await this.linkPhotos(id, entry.photos ?? []);
  }

  /** Removes the row for good. */
  async deletePermanently(id: string): Promise<void> {
    await this.db.run('DELETE FROM photos WHERE entry_id = ?', [id]);
    await this.db.run('DELETE FROM entries WHERE id = ?', [id]);
  }

  /** Moves an entry to the trash. It stays recoverable for 30 days. */
  async trash(id: string): Promise<void> {
    await this.db.run('UPDATE entries SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [this.now(), id]);
  }

  async restore(id: string): Promise<void> {
    await this.db.run('UPDATE entries SET deleted_at = NULL WHERE id = ?', [id]);
  }

  /** Trashed entries, most recently trashed first. */
  async listTrash(): Promise<StoredEntry[]> {
    const rows = await this.db.all<Row>('SELECT * FROM entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC');
    return rows.map((r) => this.open(r));
  }

  async emptyTrash(): Promise<void> {
    await this.db.run('DELETE FROM photos WHERE entry_id IN (SELECT id FROM entries WHERE deleted_at IS NOT NULL)');
    await this.db.run('DELETE FROM entries WHERE deleted_at IS NOT NULL');
  }

  /** Deletes entries that have been in the trash for 30 days or more. Entries not in the trash are never touched. */
  async purgeExpired(): Promise<void> {
    const limit = this.now() - TRASH_DAYS * DAY_MS;
    await this.db.run('DELETE FROM photos WHERE entry_id IN (SELECT id FROM entries WHERE deleted_at IS NOT NULL AND deleted_at <= ?)', [limit]);
    await this.db.run('DELETE FROM entries WHERE deleted_at IS NOT NULL AND deleted_at <= ?', [limit]);
  }

  async get(id: string): Promise<StoredEntry | null> {
    const rows = await this.db.all<Row>('SELECT * FROM entries WHERE id = ?', [id]);
    return rows.length ? this.open(rows[0]) : null;
  }

  /** Every entry that is not in the trash, decrypted, newest day first. Used by search. */
  async listAll(): Promise<StoredEntry[]> {
    const rows = await this.db.all<Row>('SELECT * FROM entries WHERE deleted_at IS NULL ORDER BY day DESC, updated_at DESC');
    return rows.map((r) => this.open(r));
  }

  /** Entries written on this month and day in years before `beforeYear` (not in the trash), newest year first. Reads only those rows. */
  async listOnDay(month: number, day: number, beforeYear: number): Promise<StoredEntry[]> {
    const md = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rows = await this.db.all<Row>(
      'SELECT * FROM entries WHERE deleted_at IS NULL AND substr(day, 6) = ? AND CAST(substr(day, 1, 4) AS INTEGER) < ? ORDER BY day DESC, created_at',
      [md, beforeYear],
    );
    return rows.map((r) => this.open(r));
  }

  /** Every day that has at least one entry, oldest first. Needs no decryption (the day is stored in the clear). */
  async listDays(): Promise<string[]> {
    const rows = await this.db.all<{ day: string }>('SELECT DISTINCT day FROM entries WHERE deleted_at IS NULL ORDER BY day');
    return rows.map((r) => r.day);
  }

  /** month = "YYYY-MM". Ordered by day, then by creation time. */
  async listMonth(month: string): Promise<StoredEntry[]> {
    const rows = await this.db.all<Row>('SELECT * FROM entries WHERE deleted_at IS NULL AND day >= ? AND day < ? ORDER BY day, created_at', [
      `${month}-01`,
      `${month}-32`,
    ]);
    return rows.map((r) => this.open(r));
  }
}

/** Reads the recovery blob without any key. Returns null when the database has none (fresh install). */
export async function peekRecoveryBlob(db: Db): Promise<string | null> {
  await prepareSchema(db);
  return loadRecoveryBlob(db);
}

/** The app offers a restore only when entries from an earlier install are here but the vault has no keys. */
export const needsRestore = (vaultSetUp: boolean, recoveryBlob: string | null) => !vaultSetUp && recoveryBlob !== null;

/** "Start a new diary instead": removes the old entries and blob for good and compacts the file. */
export async function eraseOldDiary(db: Db): Promise<void> {
  await db.exec('DELETE FROM photos');
  await db.exec('DELETE FROM entries');
  await db.exec('DELETE FROM meta');
  await db.exec('VACUUM');
}
