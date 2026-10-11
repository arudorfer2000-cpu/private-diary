import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { configureRandom } from '../crypto/diaryCrypto';
import { MemoryStore } from './store';
import { VaultService, isValidPasscode, isWeakPasscode } from './vaultService';
import { delayAfterFailures, MAX_DELAY_MS } from './attemptLimiter';
import { shouldLockOnIdle, shouldLockOnReturn } from './autoLock';

configureRandom((n) => new Uint8Array(randomBytes(n)));

const FAST = { m: 64, t: 1, p: 1 }; // tests only
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const PASS = '482915';
const WRONG = '739104';

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

async function freshVault() {
  const store = new MemoryStore();
  const clock = fakeClock();
  const vault = new VaultService(store, clock.now, FAST);
  const created = await vault.setup(PASS);
  return { store, clock, vault, created };
}

test('V1 setup creates passcode and recovery key; nothing readable is stored; right passcode unlocks', async () => {
  const { store, vault, created } = await freshVault();
  assert.equal(await vault.isSetUp(), true);
  const stored = store.dump();
  assert.ok(!stored.includes(PASS), 'passcode must not be stored');
  assert.ok(!stored.includes(hex(created.dataKey)), 'data key must not be stored in the clear');
  assert.ok(!stored.toUpperCase().includes(created.recoveryKey.replace(/-/g, '')), 'recovery key must not be stored');
  const r = await vault.unlock(PASS);
  assert.ok(r.ok);
  if (r.ok) assert.equal(hex(r.dataKey), hex(created.dataKey));
  await assert.rejects(() => vault.setup('111111'), /already set up/);
});

test('V2 wrong passcode is rejected and says how many tries are left before a pause', async () => {
  const { vault } = await freshVault();
  const left: number[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await vault.unlock(WRONG);
    assert.equal(r.ok, false);
    if (!r.ok && r.reason === 'wrong') {
      left.push(r.triesLeft);
      assert.equal(r.retryInMs, 0);
    } else assert.fail('expected a plain wrong answer');
  }
  assert.deepEqual(left, [4, 3, 2, 1]);
});

test('V3 after 5 wrong tries: 30 s pause even for the right passcode; doubles; capped at 15 min; paused tries do not count', async () => {
  const { vault, clock } = await freshVault();
  for (let i = 0; i < 4; i++) await vault.unlock(WRONG);
  const fifth = await vault.unlock(WRONG);
  assert.ok(!fifth.ok && fifth.reason === 'wrong' && fifth.retryInMs === 30_000);

  const blocked = await vault.unlock(PASS);
  assert.ok(!blocked.ok && blocked.reason === 'paused' && blocked.retryInMs === 30_000);

  // tries during the pause must not make it longer
  clock.advance(10_000);
  const blocked2 = await vault.unlock(WRONG);
  assert.ok(!blocked2.ok && blocked2.reason === 'paused' && blocked2.retryInMs === 20_000);
  clock.advance(20_000);

  const expected = [60_000, 120_000, 240_000, 480_000, MAX_DELAY_MS, MAX_DELAY_MS];
  for (const want of expected) {
    const r = await vault.unlock(WRONG);
    assert.ok(!r.ok && r.reason === 'wrong');
    if (!r.ok && r.reason === 'wrong') assert.equal(r.retryInMs, want);
    clock.advance(want);
  }
  assert.equal(delayAfterFailures(4), 0);
  assert.equal(delayAfterFailures(5), 30_000);
  assert.equal(delayAfterFailures(50), MAX_DELAY_MS);
});

test('V4 the pause survives an app restart (new service, same storage)', async () => {
  const { store, clock, vault } = await freshVault();
  for (let i = 0; i < 5; i++) await vault.unlock(WRONG);
  const restarted = new VaultService(store, clock.now, FAST);
  const s = await restarted.pauseStatus();
  assert.equal(s.blocked, true);
  assert.equal(s.retryInMs, 30_000);
  const r = await restarted.unlock(PASS);
  assert.ok(!r.ok && r.reason === 'paused');
});

test('V5 after the pause the right passcode works and the counter resets', async () => {
  const { vault, clock } = await freshVault();
  for (let i = 0; i < 5; i++) await vault.unlock(WRONG);
  clock.advance(30_000);
  const ok = await vault.unlock(PASS);
  assert.ok(ok.ok);
  const wrong = await vault.unlock(WRONG);
  assert.ok(!wrong.ok && wrong.reason === 'wrong');
  if (!wrong.ok && wrong.reason === 'wrong') assert.equal(wrong.triesLeft, 4);
});

test('V6 recovery key unlocks; new passcode can be set; old passcode no longer works', async () => {
  const { vault, created } = await freshVault();
  const bad = await vault.unlockWithRecovery('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA');
  assert.ok(!bad.ok && bad.reason === 'wrong');

  const r = await vault.unlockWithRecovery(created.recoveryKey);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(hex(r.dataKey), hex(created.dataKey));

  await vault.setNewPasscode(r.dataKey, '905316');
  const old = await vault.unlock(PASS);
  assert.ok(!old.ok && old.reason === 'wrong');
  const fresh = await vault.unlock('905316');
  assert.ok(fresh.ok);
  if (fresh.ok) assert.equal(hex(fresh.dataKey), hex(created.dataKey));
});

test('V7 auto-lock rules', () => {
  const limit = 5 * 60_000;
  // idle while open
  assert.equal(shouldLockOnIdle(0, limit - 1, limit), false);
  assert.equal(shouldLockOnIdle(0, limit, limit), true);
  assert.equal(shouldLockOnIdle(0, limit * 10, 0), false); // 0 = only on leaving the app
  // back from background
  assert.equal(shouldLockOnReturn(0, limit - 1, limit), false);
  assert.equal(shouldLockOnReturn(0, limit, limit), true);
  assert.equal(shouldLockOnReturn(0, 1, 0), true); // limit 0 locks at once
});

test('extra: passcode rules', () => {
  assert.equal(isValidPasscode('482915'), true);
  assert.equal(isValidPasscode('48291'), false);
  assert.equal(isValidPasscode('48291a'), false);
  for (const weak of ['000000', '111111', '123456', '654321', '234567', '12345']) assert.equal(isWeakPasscode(weak), true, weak);
  for (const fine of ['482915', '135792', '121212']) assert.equal(isWeakPasscode(fine), false, fine);
});
