/**
 * Diary encryption (step 1.1).
 *
 * Design:
 * - One random 32-byte DATA KEY encrypts every entry.
 * - The data key is stored twice, wrapped: once with a key derived from the passcode
 *   (Argon2id) and once with a random RECOVERY KEY that the user writes down.
 * - Changing the passcode only re-wraps the data key; entries stay untouched.
 * - Cipher: XChaCha20-Poly1305 (authenticated). Each entry is bound to its id through
 *   associated data, so ciphertext cannot be moved to another entry unnoticed.
 *
 * The passcode, data key and recovery key are never stored in readable form.
 * Pure JavaScript (noble libraries) so it also runs in Expo Go.
 */
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils.js';

export type RandomFn = (byteCount: number) => Uint8Array;

let random: RandomFn | null = null;

/** Must be called once at app start (and in tests). Refusing to guess keeps us from silent weak randomness. */
export function configureRandom(fn: RandomFn): void {
  random = fn;
}

function rand(n: number): Uint8Array {
  if (!random) throw new CryptoError('NO_RANDOM', 'Random source not configured');
  const out = random(n);
  if (out.length !== n) throw new CryptoError('NO_RANDOM', 'Random source returned wrong length');
  return out;
}

export type CryptoErrorCode = 'NO_RANDOM' | 'WRONG_PASSCODE' | 'WRONG_RECOVERY_KEY' | 'CORRUPT';

export class CryptoError extends Error {
  code: CryptoErrorCode;
  constructor(code: CryptoErrorCode, message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

/** New random entry id (32 hex characters). */
export function newId(): string {
  return bytesToHex(rand(16));
}

export type KdfParams = { m: number; t: number; p: number }; // m in KiB

/** 16 MiB, 2 passes. Starting point: unlock time must be measured on a real iPhone (check C9). */
export const DEFAULT_KDF: KdfParams = { m: 16384, t: 2, p: 1 };

export type KeyBundle = {
  v: 1;
  kdf: KdfParams;
  salt: string; // hex
  wrappedByPasscode: string;
  wrappedByRecovery: string;
};

export type CreatedKeys = {
  bundle: KeyBundle;
  dataKey: Uint8Array;
  recoveryKey: string; // show once to the user, never store
};

const AAD_PASSCODE = utf8ToBytes('diary/wrap/passcode/v1');
const AAD_RECOVERY = utf8ToBytes('diary/wrap/recovery/v1');
const aadEntry = (id: string) => utf8ToBytes('diary/entry/v1:' + id);
const aadPhoto = (id: string) => utf8ToBytes('diary/photo/v1:' + id);

// ---- sealed strings: "v1.<nonce hex>.<ciphertext hex>" ----

function seal(key: Uint8Array, plain: Uint8Array, aad: Uint8Array): string {
  const nonce = rand(24);
  const ct = xchacha20poly1305(key, nonce, aad).encrypt(plain);
  return `v1.${bytesToHex(nonce)}.${bytesToHex(ct)}`;
}

function open(key: Uint8Array, sealed: string, aad: Uint8Array): Uint8Array {
  const parts = sealed.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new CryptoError('CORRUPT', 'Unknown format');
  let nonce: Uint8Array;
  let ct: Uint8Array;
  try {
    nonce = hexToBytes(parts[1]);
    ct = hexToBytes(parts[2]);
  } catch {
    throw new CryptoError('CORRUPT', 'Bad encoding');
  }
  if (nonce.length !== 24) throw new CryptoError('CORRUPT', 'Bad nonce');
  return xchacha20poly1305(key, nonce, aad).decrypt(ct); // throws if tag does not match
}

async function deriveKey(passcode: string, salt: Uint8Array, kdf: KdfParams): Promise<Uint8Array> {
  const pw = utf8ToBytes(passcode.normalize('NFKC'));
  return argon2idAsync(pw, salt, { m: kdf.m, t: kdf.t, p: kdf.p, dkLen: 32 });
}

// ---- recovery key text (base32, groups of 4) ----

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string, byteLength: number): Uint8Array | null {
  const out = new Uint8Array(byteLength);
  let bits = 0;
  let value = 0;
  let idx = 0;
  for (const ch of text) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      if (idx < byteLength) out[idx++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return idx === byteLength ? out : null;
}

export function formatRecoveryKey(bytes: Uint8Array): string {
  return base32Encode(bytes).match(/.{1,4}/g)!.join('-');
}

function parseRecoveryKey(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '');
  if (clean.length !== 52) return null;
  return base32Decode(clean, 32);
}

// ---- public API ----

/** First-time setup: create data key, wrap it with the passcode and with a new recovery key. */
export async function createKeyBundle(passcode: string, kdf: KdfParams = DEFAULT_KDF): Promise<CreatedKeys> {
  const dataKey = rand(32);
  const recoveryBytes = rand(32);
  const salt = rand(16);
  const passKey = await deriveKey(passcode, salt, kdf);
  const bundle: KeyBundle = {
    v: 1,
    kdf,
    salt: bytesToHex(salt),
    wrappedByPasscode: seal(passKey, dataKey, AAD_PASSCODE),
    wrappedByRecovery: seal(recoveryBytes, dataKey, AAD_RECOVERY),
  };
  return { bundle, dataKey, recoveryKey: formatRecoveryKey(recoveryBytes) };
}

export async function unlockWithPasscode(bundle: KeyBundle, passcode: string): Promise<Uint8Array> {
  const passKey = await deriveKey(passcode, hexToBytes(bundle.salt), bundle.kdf);
  try {
    return open(passKey, bundle.wrappedByPasscode, AAD_PASSCODE);
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('WRONG_PASSCODE', 'Wrong passcode');
  }
}

export function unlockWithRecoveryKey(bundle: KeyBundle, recoveryKey: string): Uint8Array {
  const bytes = parseRecoveryKey(recoveryKey);
  if (!bytes) throw new CryptoError('WRONG_RECOVERY_KEY', 'Recovery key has the wrong format');
  try {
    return open(bytes, bundle.wrappedByRecovery, AAD_RECOVERY);
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('WRONG_RECOVERY_KEY', 'Wrong recovery key');
  }
}

/** Needs the unlocked data key. Entries stay as they are; only the passcode wrapping changes. */
export async function changePasscode(
  bundle: KeyBundle,
  dataKey: Uint8Array,
  newPasscode: string,
  kdf: KdfParams = bundle.kdf,
): Promise<KeyBundle> {
  const salt = rand(16);
  const passKey = await deriveKey(newPasscode, salt, kdf);
  return {
    ...bundle,
    kdf,
    salt: bytesToHex(salt),
    wrappedByPasscode: seal(passKey, dataKey, AAD_PASSCODE),
  };
}

export function encryptEntry(dataKey: Uint8Array, entryId: string, plaintext: string): string {
  return seal(dataKey, utf8ToBytes(plaintext), aadEntry(entryId));
}

export function decryptEntry(dataKey: Uint8Array, entryId: string, sealed: string): string {
  try {
    return bytesToUtf8(open(dataKey, sealed, aadEntry(entryId)));
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('CORRUPT', 'Entry could not be decrypted');
  }
}

/** Photos: raw bytes sealed with the data key; the photo id is bound in, so a blob cannot be moved to another photo. */
export function encryptBytes(dataKey: Uint8Array, photoId: string, bytes: Uint8Array): string {
  return seal(dataKey, bytes, aadPhoto(photoId));
}

export function decryptBytes(dataKey: Uint8Array, photoId: string, sealed: string): Uint8Array {
  try {
    return open(dataKey, sealed, aadPhoto(photoId));
  } catch (e) {
    if (e instanceof CryptoError) throw e;
    throw new CryptoError('CORRUPT', 'Photo could not be decrypted');
  }
}

/** Hex helpers for code outside src/crypto (keeps all library imports in this folder). */
export { bytesToHex, hexToBytes };
