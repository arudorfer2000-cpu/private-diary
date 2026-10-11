import { imageMime, toBase64 } from './base64';
import type { EntryRepository } from '../storage/entryRepository';

export type PhotoPick = { status: 'ok'; id: string } | { status: 'cancelled' | 'limit' | 'too-big' | 'not-image' | 'error' };

/** Takes a chosen picture (bytes, or null if cancelled), checks it and stores it sealed. */
export async function storePickedPhoto(repo: EntryRepository, pick: () => Promise<Uint8Array | null>, countAlready: number): Promise<PhotoPick> {
  try {
    if (countAlready >= 10) return { status: 'limit' };
    const bytes = await pick();
    if (!bytes) return { status: 'cancelled' };
    if (!imageMime(bytes)) return { status: 'not-image' };
    const r = await repo.addPhoto(bytes, countAlready);
    if (r.ok) return { status: 'ok', id: r.id };
    return { status: r.reason === 'empty' ? 'error' : r.reason };
  } catch {
    return { status: 'error' }; // never log content
  }
}

/** A picture as a data address for the Image component, or null if missing or unreadable. */
export async function photoDataUri(repo: EntryRepository, id: string): Promise<string | null> {
  try {
    const bytes = await repo.getPhoto(id);
    const mime = bytes ? imageMime(bytes) : null;
    return bytes && mime ? `data:${mime};base64,${toBase64(bytes)}` : null;
  } catch {
    return null;
  }
}
