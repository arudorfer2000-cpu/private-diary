import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { configureRandom, decryptBytes, encryptBytes, encryptEntry, CryptoError } from '../crypto/diaryCrypto';
import type { Db } from '../storage/db';
import { EntryRepository, prepareSchema } from '../storage/entryRepository';
import { EditorSession } from '../editor/editorSession';
import { wipeAll } from '../data/wipe';
import { cleanPlace, formatPlace } from '../place/place';
import { MAX_PHOTO_BYTES, imageMime, toBase64 } from './base64';
import { photoDataUri, storePickedPhoto } from './photoActions';

configureRandom((n) => new Uint8Array(randomBytes(n)));
const DAY = 24 * 60 * 60 * 1000;

function nodeDb(path: string): Db {
  const d = new DatabaseSync(path);
  return {
    exec: async (sql) => void d.exec(sql),
    run: async (sql, params = []) => void d.prepare(sql).run(...params),
    all: async <T,>(sql: string, params: (string | number | null)[] = []) => d.prepare(sql).all(...params) as T[],
    close: async () => void d.close(),
  };
}

async function fresh(clock = { t: 1_700_000_000_000 }) {
  const dir = mkdtempSync(join(tmpdir(), 'diary-ph-'));
  const file = join(dir, 'diary.db');
  const db = nodeDb(file);
  await prepareSchema(db);
  const key = new Uint8Array(randomBytes(32));
  const repo = new EntryRepository(db, key, () => clock.t);
  const photoRows = async () => (await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM photos'))[0].n;
  return { dir, file, db, key, repo, clock, photoRows, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const JPEG = (marker: string, extra = 0) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(marker), ...new Uint8Array(extra).fill(7)]);
const E = (text: string, photos?: string[], place?: { lat: number; lon: number }) => ({ mood: 3, title: 't', text, tags: [], ...(photos ? { photos } : {}), ...(place ? { place } : {}) });

test('P1 photo crypto: round trip, wrong key / id / tampering fail, no plaintext in the sealed text', () => {
  const key = new Uint8Array(randomBytes(32));
  const bytes = JPEG('SECRET-PHOTO-MARKER', 300);
  const sealed = encryptBytes(key, 'photo-id-0001', bytes);
  assert.deepEqual(decryptBytes(key, 'photo-id-0001', sealed), bytes);
  assert.ok(!sealed.includes(Buffer.from('SECRET-PHOTO-MARKER').toString('hex')));
  assert.throws(() => decryptBytes(new Uint8Array(randomBytes(32)), 'photo-id-0001', sealed), CryptoError);
  assert.throws(() => decryptBytes(key, 'photo-id-0002', sealed), CryptoError, 'bound to its id');
  const parts = sealed.split('.');
  const flipped = parts[2].slice(0, 10) + (parts[2][10] === '0' ? '1' : '0') + parts[2].slice(11);
  assert.throws(() => decryptBytes(key, 'photo-id-0001', `${parts[0]}.${parts[1]}.${flipped}`), CryptoError);
  assert.throws(() => decryptBytes(key, 'photo-id-0001', encryptEntry(key, 'photo-id-0001', 'text')), CryptoError, 'an entry blob is not a photo');
  assert.deepEqual(decryptBytes(key, 'x'.repeat(8), encryptBytes(key, 'x'.repeat(8), new Uint8Array(0))), new Uint8Array(0));
});

test('P2 repository: link on save, delete with the entry, trash keeps, purge/empty/wipe remove, prune, unlinked purge', async () => {
  const { repo, db, photoRows, clock, key, cleanup } = await fresh();
  const a = await repo.addPhoto(JPEG('A'), 0);
  const b = await repo.addPhoto(JPEG('B'), 1);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assert.deepEqual(await repo.getPhoto(a.id), JPEG('A'));
  const e1 = await repo.create('2026-10-01', E('one', [a.id, b.id]));
  assert.deepEqual((await repo.get(e1.id))?.entry.photos, [a.id, b.id]);
  assert.equal((await db.all<{ entry_id: string }>('SELECT entry_id FROM photos WHERE id = ?', [a.id]))[0].entry_id, e1.id);
  // another entry cannot take over a linked photo
  const e2 = await repo.create('2026-10-02', E('two', [a.id]));
  assert.equal((await db.all<{ entry_id: string }>('SELECT entry_id FROM photos WHERE id = ?', [a.id]))[0].entry_id, e1.id);
  await repo.deletePermanently(e2.id);
  assert.equal(await photoRows(), 2, 'deleting e2 does not touch e1 photos');
  // prune keeps only the listed
  await repo.prunePhotos(e1.id, [a.id]);
  assert.equal(await repo.getPhoto(b.id), null);
  assert.ok(await repo.getPhoto(a.id));
  // trash keeps photos, restore brings them back
  await repo.trash(e1.id);
  assert.ok(await repo.getPhoto(a.id));
  await repo.restore(e1.id);
  assert.deepEqual((await repo.get(e1.id))?.entry.photos, [a.id, b.id], 'entry text still lists both ids; b is gone');
  // purge after 30 days
  await repo.trash(e1.id);
  clock.t += 31 * DAY;
  await repo.purgeExpired();
  assert.equal(await photoRows(), 0);
  // emptyTrash
  const c = await repo.addPhoto(JPEG('C'), 0);
  assert.ok(c.ok);
  if (!c.ok) return;
  const e3 = await repo.create('2026-10-03', E('three', [c.id]));
  await repo.trash(e3.id);
  await repo.emptyTrash();
  assert.equal(await photoRows(), 0);
  // unlinked photos are purged at unlock
  const d = await repo.addPhoto(JPEG('D'), 0);
  assert.ok(d.ok);
  assert.equal(await photoRows(), 1);
  await repo.purgeUnlinkedPhotos();
  assert.equal(await photoRows(), 0);
  // wipeAll
  const f = await repo.addPhoto(JPEG('F'), 0);
  assert.ok(f.ok);
  if (!f.ok) return;
  await repo.create('2026-10-04', E('four', [f.id]));
  const noop = async () => undefined;
  await wipeAll({ db, vault: { reset: noop } as never, settings: { clear: noop } as never, disableBiometric: noop });
  assert.equal(await photoRows(), 0);
  assert.equal((await db.all<{ n: number }>('SELECT COUNT(*) AS n FROM entries'))[0].n, 0);
  void key;
  await db.close();
  cleanup();
});

test('P3 limits and validation', async () => {
  const { repo, db, photoRows, key, cleanup } = await fresh();
  assert.deepEqual(await repo.addPhoto(JPEG('x'), 10), { ok: false, reason: 'limit' });
  assert.deepEqual(await repo.addPhoto(new Uint8Array(MAX_PHOTO_BYTES + 1), 0), { ok: false, reason: 'too-big' });
  assert.deepEqual(await repo.addPhoto(new Uint8Array(0), 0), { ok: false, reason: 'empty' });
  assert.equal(await photoRows(), 0, 'nothing stored for refused photos');
  const edge = await repo.addPhoto(new Uint8Array(MAX_PHOTO_BYTES), 9);
  assert.ok(edge.ok, 'exactly 4 MB and the 10th photo are fine');
  // garbage ids in an old/odd payload are dropped when reading
  const id = 'b'.repeat(32);
  const payload = encryptEntry(key, id, JSON.stringify({ mood: 3, title: '', text: 'x', tags: [], photos: ['ok-photo-id', '../../x', 42, 'a b'], place: { lat: 'x', lon: 1 } }));
  await db.run('INSERT INTO entries (id, day, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?)', [id, '2026-10-01', 1, 1, payload]);
  const got = (await repo.get(id))?.entry;
  assert.deepEqual(got?.photos, ['ok-photo-id']);
  assert.equal(got?.place, undefined);
  // the picker wrapper: cancelled, not an image, limit, too big, error
  assert.deepEqual(await storePickedPhoto(repo, async () => null, 0), { status: 'cancelled' });
  assert.deepEqual(await storePickedPhoto(repo, async () => Uint8Array.from([1, 2, 3, 4]), 0), { status: 'not-image' });
  assert.deepEqual(await storePickedPhoto(repo, async () => JPEG('z'), 10), { status: 'limit' });
  assert.deepEqual(await storePickedPhoto(repo, async () => JPEG('z', MAX_PHOTO_BYTES), 0), { status: 'too-big' });
  assert.deepEqual(await storePickedPhoto(repo, async () => { throw new Error('boom'); }, 0), { status: 'error' });
  const ok = await storePickedPhoto(repo, async () => JPEG('real'), 0);
  assert.equal(ok.status, 'ok');
  if (ok.status === 'ok') assert.ok((await photoDataUri(repo, ok.id))?.startsWith('data:image/jpeg;base64,'));
  assert.equal(await photoDataUri(repo, 'missing-photo-id'), null);
  await db.close();
  cleanup();
});

test('P4 base64 and image detection', () => {
  const enc = (s: string) => toBase64(Buffer.from(s));
  for (const s of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar']) assert.equal(enc(s), Buffer.from(s).toString('base64'), s);
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.equal(toBase64(all), Buffer.from(all).toString('base64'));
  assert.equal(imageMime(JPEG('x')), 'image/jpeg');
  assert.equal(imageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0])), 'image/png');
  assert.equal(imageMime(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])), null);
});

test('P5 editor: photo-only entries are kept; discard handles added and original photos', async () => {
  const { repo, photoRows, cleanup, db } = await fresh();
  // photo only
  const p1 = await repo.addPhoto(JPEG('P1'), 0);
  assert.ok(p1.ok);
  if (!p1.ok) return;
  const s1 = new EditorSession(repo, '2026-10-05', null, 0, { set: (fn) => { fn(); return 1; }, clear: () => undefined });
  s1.change({ mood: 3, title: '', text: '', tags: [], photos: [p1.id] });
  assert.ok(await s1.flush());
  const saved = (await repo.listAll()).find((x) => x.day === '2026-10-05');
  assert.deepEqual(saved?.entry.photos, [p1.id], 'not treated as empty');
  // existing entry: add one, remove the original, then discard -> original back, added gone
  const p2 = await repo.addPhoto(JPEG('P2'), 1);
  assert.ok(p2.ok);
  if (!p2.ok || !saved) return;
  const s2 = new EditorSession(repo, '2026-10-05', saved, 0, { set: (fn) => { fn(); return 1; }, clear: () => undefined });
  s2.change({ ...saved.entry, photos: [p2.id] });
  await s2.flush();
  await s2.discard();
  assert.ok(await repo.getPhoto(p1.id), 'original photo kept');
  assert.equal(await repo.getPhoto(p2.id), null, 'photo added in the discarded session removed');
  assert.deepEqual((await repo.get(saved.id))?.entry.photos, [p1.id]);
  // finish removes photos dropped from the entry
  const s3 = new EditorSession(repo, '2026-10-05', saved, 0, { set: (fn) => { fn(); return 1; }, clear: () => undefined });
  s3.change({ ...saved.entry, text: 'keep', photos: [] });
  await s3.finish();
  assert.equal(await repo.getPhoto(p1.id), null);
  // discard of a brand-new entry removes its photos
  const p3 = await repo.addPhoto(JPEG('P3'), 0);
  assert.ok(p3.ok);
  if (!p3.ok) return;
  const s4 = new EditorSession(repo, '2026-10-06', null, 0, { set: (fn) => { fn(); return 1; }, clear: () => undefined });
  s4.change({ mood: 3, title: 'x', text: 'y', tags: [], photos: [p3.id] });
  await s4.flush();
  await s4.discard();
  assert.equal(await photoRows(), 0);
  await db.close();
  cleanup();
});

test('L1 place: validation, rounding, formatting, stored with the entry', async () => {
  assert.deepEqual(cleanPlace({ lat: 40.71284, lon: -74.00596 }), { lat: 40.713, lon: -74.006 });
  assert.deepEqual(cleanPlace({ lat: -0.0001, lon: 0 }), { lat: 0, lon: 0 });
  for (const bad of [null, undefined, 5, {}, { lat: 91, lon: 0 }, { lat: 0, lon: 181 }, { lat: NaN, lon: 0 }, { lat: '1', lon: 2 }, { lat: Infinity, lon: 0 }]) assert.equal(cleanPlace(bad), undefined);
  assert.equal(formatPlace({ lat: 40.713, lon: -74.006 }), '40.713° N, 74.006° W');
  assert.equal(formatPlace({ lat: -33.869, lon: 151.209 }), '33.869° S, 151.209° E');
  const { repo, db, cleanup } = await fresh();
  const e = await repo.create('2026-10-01', E('here', undefined, { lat: 1.23456, lon: 2.34567 }));
  assert.deepEqual((await repo.get(e.id))?.entry.place, { lat: 1.235, lon: 2.346 });
  await db.close();
  cleanup();
});

test('P2b the stored file holds no readable photo bytes or marker text', async () => {
  const { repo, db, file, cleanup } = await fresh();
  const p = await repo.addPhoto(JPEG('VISIBLE-MARKER-QWX', 2000), 0);
  assert.ok(p.ok);
  if (!p.ok) return;
  await repo.create('2026-10-01', E('x', [p.id]));
  await db.close();
  const raw = readFileSync(file);
  assert.equal(raw.includes(Buffer.from('VISIBLE-MARKER-QWX')), false);
  assert.equal(raw.includes(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), false, 'no JPEG signature on disk');
  cleanup();
});
