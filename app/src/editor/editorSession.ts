import type { Entry } from '../types';
import type { EntryRepository, StoredEntry } from '../storage/entryRepository';

export type SaveStatus = 'idle' | 'dirty' | 'saved' | 'error';

export type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export const AUTOSAVE_DELAY_MS = 600;

const sameList = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);
const samePlace = (a: Entry['place'], b: Entry['place']) => (!a && !b) || (!!a && !!b && a.lat === b.lat && a.lon === b.lon);

const same = (a: Entry | null, b: Entry | null) =>
  a !== null && b !== null && a.mood === b.mood && a.title === b.title && a.text === b.text && sameList(a.tags, b.tags) && sameList(a.photos, b.photos) && samePlace(a.place, b.place);

const isEmpty = (e: Entry) => e.text.trim() === '' && e.title.trim() === '' && e.tags.length === 0 && (e.photos?.length ?? 0) === 0 && !e.place;

/**
 * One editing session for one day. Every change is saved (encrypted) after a short pause.
 * Saves run one at a time, so the first save creates the entry and all later ones update it.
 */
export class EditorSession {
  private id: string | null;
  private trashed = false;
  private readonly original: Entry | null;
  private lastSaved: Entry | null;
  private pending: Entry | null = null;
  private timer: unknown = null;
  private chain: Promise<void> = Promise.resolve();
  status: SaveStatus = 'idle';
  onStatus: ((s: SaveStatus) => void) | null = null;

  constructor(
    private repo: EntryRepository,
    readonly day: string,
    existing: StoredEntry | null,
    private delayMs: number = AUTOSAVE_DELAY_MS,
    private timers: Timers = realTimers,
  ) {
    this.id = existing?.id ?? null;
    this.original = existing?.entry ?? null;
    this.lastSaved = existing?.entry ?? null;
  }

  private setStatus(s: SaveStatus) {
    this.status = s;
    this.onStatus?.(s);
  }

  /** Call on every edit. */
  change(entry: Entry): void {
    this.pending = entry;
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.enqueue();
    }, this.delayMs);
    this.setStatus('dirty');
  }

  private enqueue(): Promise<void> {
    this.chain = this.chain.then(() => this.saveOnce());
    return this.chain;
  }

  private async persist(e: Entry): Promise<void> {
    if (isEmpty(e)) {
      // Emptying an entry moves it to the trash (recoverable) instead of deleting it for good.
      if (this.id && !this.trashed) {
        await this.repo.trash(this.id);
        this.trashed = true;
      }
      return;
    }
    if (this.id) {
      if (this.trashed) {
        await this.repo.restore(this.id);
        this.trashed = false;
      }
      await this.repo.update(this.id, e);
    } else {
      this.id = (await this.repo.create(this.day, e)).id;
    }
  }

  private async saveOnce(): Promise<void> {
    const e = this.pending;
    if (!e) return;
    this.pending = null;
    if (same(e, this.lastSaved)) {
      if (!this.pending) this.setStatus(this.status === 'error' ? 'saved' : this.status === 'dirty' ? 'saved' : this.status);
      return;
    }
    try {
      await this.persist(e);
      this.lastSaved = e;
      this.setStatus(this.pending ? 'dirty' : 'saved');
    } catch {
      if (!this.pending) this.pending = e; // keep the text for the next try; never log it
      this.setStatus('error');
    }
  }

  /** Saves right now and waits. Resolves true when everything typed is stored. */
  async flush(): Promise<boolean> {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    await this.enqueue();
    return this.pending === null && this.status !== 'error';
  }

  /** After a final flush: photos that were removed from the entry during the session are deleted for good. */
  async finish(): Promise<void> {
    await this.flush();
    if (this.id && !this.trashed && this.lastSaved) await this.repo.prunePhotos(this.id, this.lastSaved.photos ?? []);
  }

  /** Throws away this session's changes: a new entry is removed, an existing one returns to how it was. */
  async discard(): Promise<void> {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    this.pending = null;
    await this.chain;
    if (this.original) {
      if (this.id) {
        if (this.trashed) {
          await this.repo.restore(this.id);
          this.trashed = false;
        }
        await this.repo.update(this.id, this.original);
        await this.repo.prunePhotos(this.id, this.original.photos ?? []); // photos added in this session go
      } else {
        this.id = (await this.repo.create(this.day, this.original)).id;
      }
    } else if (this.id) {
      await this.repo.deletePermanently(this.id); // a brand-new entry the user did not keep (its photos go too)
      this.id = null;
      this.trashed = false;
    }
    if (!this.id) await this.repo.purgeUnlinkedPhotos(); // photos picked for an entry that was never saved
    this.lastSaved = this.original;
    this.setStatus('idle');
  }

  /** Saves what is typed, then moves the entry to the trash. Does nothing if nothing was ever saved. */
  async moveToTrash(): Promise<void> {
    await this.flush();
    if (this.id && !this.trashed) {
      await this.repo.trash(this.id);
      this.trashed = true;
    }
  }
}
