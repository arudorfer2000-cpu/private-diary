import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  configureRandom,
  createKeyBundle,
  unlockWithPasscode,
  unlockWithRecoveryKey,
  changePasscode,
  encryptEntry,
  decryptEntry,
  DEFAULT_KDF,
  CryptoError,
} from './diaryCrypto';

configureRandom((n) => new Uint8Array(randomBytes(n)));

// Fast settings for tests only. The real default is DEFAULT_KDF.
const FAST = { m: 64, t: 1, p: 1 };
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

test('C1 round trip keeps text exactly (umlauts, emoji, newlines)', async () => {
  const { dataKey } = await createKeyBundle('123456', FAST);
  const text = 'Heute war ein schöner Tag 🌙\n\nÄÖÜ ß — "quotes"';
  const sealed = encryptEntry(dataKey, 'entry-1', text);
  assert.equal(decryptEntry(dataKey, 'entry-1', sealed), text);
});

test('C2 wrong passcode fails, right passcode returns the same data key', async () => {
  const { bundle, dataKey } = await createKeyBundle('123456', FAST);
  await assert.rejects(() => unlockWithPasscode(bundle, '654321'), (e: unknown) => e instanceof CryptoError && e.code === 'WRONG_PASSCODE');
  const again = await unlockWithPasscode(bundle, '123456');
  assert.equal(hex(again), hex(dataKey));
});

test('C3 recovery key unlocks; wrong or malformed recovery key fails', async () => {
  const { bundle, dataKey, recoveryKey } = await createKeyBundle('123456', FAST);
  assert.match(recoveryKey, /^([A-Z2-7]{4}-){12}[A-Z2-7]{4}$/);
  assert.equal(hex(unlockWithRecoveryKey(bundle, recoveryKey)), hex(dataKey));
  // lower case and spaces instead of dashes are accepted
  assert.equal(hex(unlockWithRecoveryKey(bundle, recoveryKey.toLowerCase().replace(/-/g, ' '))), hex(dataKey));
  const other = (await createKeyBundle('123456', FAST)).recoveryKey;
  assert.throws(() => unlockWithRecoveryKey(bundle, other), (e: unknown) => e instanceof CryptoError && e.code === 'WRONG_RECOVERY_KEY');
  assert.throws(() => unlockWithRecoveryKey(bundle, 'ABCD-EFGH'), (e: unknown) => e instanceof CryptoError && e.code === 'WRONG_RECOVERY_KEY');
});

test('C4 stored data contains no plaintext, passcode, data key or recovery key', async () => {
  const passcode = 'my-secret-passcode-987';
  const { bundle, dataKey, recoveryKey } = await createKeyBundle(passcode, FAST);
  const plain = 'Ich bin nicht mehr wütend auf Mara';
  const sealed = encryptEntry(dataKey, 'e1', plain);
  const stored = JSON.stringify(bundle) + sealed;
  assert.ok(!stored.includes(plain));
  assert.ok(!stored.includes('Mara'));
  assert.ok(!stored.includes(passcode));
  assert.ok(!stored.includes(hex(dataKey)));
  assert.ok(!stored.toUpperCase().includes(recoveryKey.replace(/-/g, '')));
});

test('C5 tampered ciphertext fails; ciphertext moved to another entry id fails', async () => {
  const { dataKey } = await createKeyBundle('123456', FAST);
  const sealed = encryptEntry(dataKey, 'entry-1', 'secret');
  const parts = sealed.split('.');
  const last = parts[2];
  const flipped = (last[0] === '0' ? '1' : '0') + last.slice(1);
  const tampered = [parts[0], parts[1], flipped].join('.');
  assert.throws(() => decryptEntry(dataKey, 'entry-1', tampered), CryptoError);
  assert.throws(() => decryptEntry(dataKey, 'entry-2', sealed), CryptoError);
  assert.throws(() => decryptEntry(dataKey, 'entry-1', 'garbage'), (e: unknown) => e instanceof CryptoError && e.code === 'CORRUPT');
  const wrongKey = (await createKeyBundle('123456', FAST)).dataKey;
  assert.throws(() => decryptEntry(wrongKey, 'entry-1', sealed), CryptoError);
});

test('C6 same text encrypted twice gives different ciphertext', async () => {
  const { dataKey } = await createKeyBundle('123456', FAST);
  const a = encryptEntry(dataKey, 'e1', 'same text');
  const b = encryptEntry(dataKey, 'e1', 'same text');
  assert.notEqual(a, b);
  assert.equal(decryptEntry(dataKey, 'e1', a), decryptEntry(dataKey, 'e1', b));
});

test('C7 changing the passcode: old fails, new works, old entries still decrypt, recovery key still works', async () => {
  const { bundle, dataKey, recoveryKey } = await createKeyBundle('111111', FAST);
  const sealed = encryptEntry(dataKey, 'e1', 'written before the change');
  const next = await changePasscode(bundle, dataKey, '222222');
  await assert.rejects(() => unlockWithPasscode(next, '111111'), CryptoError);
  const unlocked = await unlockWithPasscode(next, '222222');
  assert.equal(decryptEntry(unlocked, 'e1', sealed), 'written before the change');
  assert.equal(hex(unlockWithRecoveryKey(next, recoveryKey)), hex(dataKey));
  assert.notEqual(next.salt, bundle.salt);
});

test('info: default Argon2id settings on this machine (the iPhone must be measured separately, check C9)', async () => {
  const t0 = performance.now();
  const { bundle } = await createKeyBundle('123456', DEFAULT_KDF);
  const t1 = performance.now();
  await unlockWithPasscode(bundle, '123456');
  const t2 = performance.now();
  console.log(`DEFAULT_KDF ${JSON.stringify(DEFAULT_KDF)}: setup ${Math.round(t1 - t0)} ms, unlock ${Math.round(t2 - t1)} ms (cloud Node, not iPhone)`);
});
