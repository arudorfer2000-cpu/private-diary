import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { configureRandom } from '../crypto/diaryCrypto';
import { MemoryStore } from './store';
import { VaultService, isValidPasscode, isWeakPasscode } from './vaultService';

configureRandom((n) => new Uint8Array(randomBytes(n)));
const FAST = { m: 64, t: 1, p: 1 };
const PHRASE = 'blue kettle sings at dawn';
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

test('P1 valid passcode = 6 digits or 10 to 128 characters', () => {
  assert.equal(isValidPasscode('482915'), true);
  assert.equal(isValidPasscode(PHRASE), true);
  assert.equal(isValidPasscode('abcdefghij'), true);
  assert.equal(isValidPasscode('abcdefghi'), false); // 9
  assert.equal(isValidPasscode('48291'), false);
  assert.equal(isValidPasscode('x'.repeat(129)), false);
  assert.equal(isValidPasscode('x'.repeat(128)), true);
});

test('P2 weak passphrases are refused', () => {
  for (const weak of ['aaaaaaaaaaaa', 'abababababab', 'abcde abcde', '1234567890', '0123456789', '9876543210', '          ']) {
    assert.equal(isWeakPasscode(weak), true, weak);
  }
  for (const fine of [PHRASE, 'correct horse battery', 'Tr0ub4dor&3x', '4829153047']) assert.equal(isWeakPasscode(fine), false, fine);
});

test('P3 passphrase setup, unlock, wrong tries and kind', async () => {
  const store = new MemoryStore();
  const vault = new VaultService(store, () => 1_000_000, FAST);
  const created = await vault.setup(PHRASE);
  assert.equal(await vault.getPasscodeKind(), 'phrase');
  assert.ok(!store.dump().includes(PHRASE), 'passphrase must not be stored');
  const ok = await vault.unlock(PHRASE);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(hex(ok.dataKey), hex(created.dataKey));
  const bad = await vault.unlock('blue kettle sings at dusk');
  assert.ok(!bad.ok);
  if (!bad.ok && bad.reason === 'wrong') assert.equal(bad.triesLeft, 4);
  for (let i = 0; i < 4; i++) await vault.unlock('wrong wrong wrong');
  const paused = await vault.unlock(PHRASE);
  assert.ok(!paused.ok && paused.reason === 'paused');

  const pinVault = new VaultService(new MemoryStore(), () => 1, FAST);
  await pinVault.setup('482915');
  assert.equal(await pinVault.getPasscodeKind(), 'pin');
});

test('P4 switching kind and restore with a passphrase', async () => {
  const store = new MemoryStore();
  const vault = new VaultService(store, () => 1_000_000, FAST);
  const created = await vault.setup('482915');
  await vault.setNewPasscode(created.dataKey, PHRASE);
  assert.equal(await vault.getPasscodeKind(), 'phrase');
  assert.ok((await vault.unlock(PHRASE)).ok);
  await vault.setNewPasscode(created.dataKey, '135792');
  assert.equal(await vault.getPasscodeKind(), 'pin');
  assert.ok((await vault.unlock('135792')).ok);

  const blob = await vault.getRecoveryBlob();
  const phone2 = new VaultService(new MemoryStore(), () => 1_000_000, FAST);
  const r = await phone2.restoreWithRecovery(blob, created.recoveryKey);
  assert.ok(r.ok);
  if (r.ok) await phone2.finishRestore(blob, r.dataKey, PHRASE);
  assert.equal(await phone2.getPasscodeKind(), 'phrase');
  assert.ok((await phone2.unlock(PHRASE)).ok);
});

test('P5 Unicode forms of the same passphrase unlock', async () => {
  const vault = new VaultService(new MemoryStore(), () => 1_000_000, FAST);
  await vault.setup('café au lait chaud'); // é as one character
  const r = await vault.unlock('café au lait chaud'); // e + combining accent
  assert.ok(r.ok);
});
