import {
  CryptoError,
  DEFAULT_KDF,
  changePasscode,
  createKeyBundle,
  unlockWithPasscode,
  unlockWithRecoveryKey,
  type KdfParams,
  type KeyBundle,
} from '../crypto/diaryCrypto';
import { AttemptLimiter } from './attemptLimiter';
import type { KeyValueStore } from './store';

const BUNDLE_KEY = 'diary.bundle';
const KIND_KEY = 'diary.passcodeKind';

export type UnlockResult =
  | { ok: true; dataKey: Uint8Array; ms: number }
  | { ok: false; reason: 'wrong'; triesLeft: number; retryInMs: number }
  | { ok: false; reason: 'paused'; retryInMs: number };

export const PASSCODE_LENGTH = 6;
export const PASSPHRASE_MIN = 10;
export const PASSPHRASE_MAX = 128;
export type PasscodeKind = 'pin' | 'phrase';

/** One form for the same text, so é typed as one character or as e + accent gives the same key. */
export function normalizePasscode(p: string): string {
  return p.normalize('NFKC');
}

export function isValidPin(p: string): boolean {
  return new RegExp(`^\\d{${PASSCODE_LENGTH}}$`).test(p);
}

/** 6 digits, or a passphrase of 10 to 128 characters. */
export function isValidPasscode(p: string): boolean {
  if (isValidPin(p)) return true;
  const n = [...normalizePasscode(p)].length;
  return n >= PASSPHRASE_MIN && n <= PASSPHRASE_MAX;
}

export function passcodeKind(p: string): PasscodeKind {
  return isValidPin(p) ? 'pin' : 'phrase';
}

/** Rejects the most guessable passcodes: repeats and straight runs of digits, and for passphrases repeated or very plain text. */
export function isWeakPasscode(raw: string): boolean {
  if (!isValidPasscode(raw)) return true;
  const p = normalizePasscode(raw);
  if (isValidPin(p)) {
    if (/^(\d)\1+$/.test(p)) return true;
    const d = [...p].map(Number);
    const up = d.every((v, i) => i === 0 || v === d[i - 1] + 1);
    const down = d.every((v, i) => i === 0 || v === d[i - 1] - 1);
    return up || down;
  }
  const chars = [...p];
  if (new Set(chars).size < 5) return true;
  if (/^(.+?)\1+$/u.test(p.replace(/\s+/gu, ''))) return true;
  if (/^\d+$/.test(p)) {
    const d = chars.map(Number);
    const up = d.every((v, i) => i === 0 || v === (d[i - 1] + 1) % 10);
    const down = d.every((v, i) => i === 0 || v === (d[i - 1] + 9) % 10);
    return up || down;
  }
  return false;
}

/** Combines key handling, the attempt limit and storage. Holds no secrets itself. */
export class VaultService {
  private limiter: AttemptLimiter;

  constructor(
    private store: KeyValueStore,
    private now: () => number = Date.now,
    private kdf: KdfParams = DEFAULT_KDF,
  ) {
    this.limiter = new AttemptLimiter(store, now);
  }

  async isSetUp(): Promise<boolean> {
    return (await this.store.get(BUNDLE_KEY)) !== null;
  }

  private async loadBundle(): Promise<KeyBundle> {
    const raw = await this.store.get(BUNDLE_KEY);
    if (!raw) throw new CryptoError('CORRUPT', 'Vault is not set up');
    try {
      return JSON.parse(raw) as KeyBundle;
    } catch {
      throw new CryptoError('CORRUPT', 'Key bundle is unreadable');
    }
  }

  /** Remaining pause, e.g. to show a countdown right after the app starts. */
  pauseStatus() {
    return this.limiter.status();
  }

  /** Which entry screen to show before unlocking. Not secret: it only says digits or text. */
  async getPasscodeKind(): Promise<PasscodeKind> {
    return (await this.store.get(KIND_KEY)) === 'phrase' ? 'phrase' : 'pin';
  }

  async setup(passcodeRaw: string): Promise<{ dataKey: Uint8Array; recoveryKey: string }> {
    const passcode = normalizePasscode(passcodeRaw);
    if (await this.isSetUp()) throw new Error('Vault is already set up');
    if (!isValidPasscode(passcode)) throw new Error('Passcode must be 6 digits or a passphrase of at least 10 characters');
    const { bundle, dataKey, recoveryKey } = await createKeyBundle(passcode, this.kdf);
    await this.store.set(BUNDLE_KEY, JSON.stringify(bundle));
    await this.store.set(KIND_KEY, passcodeKind(passcode));
    await this.limiter.recordSuccess();
    return { dataKey, recoveryKey };
  }

  private async attempt(
    run: (bundle: KeyBundle) => Promise<Uint8Array> | Uint8Array,
    wrongCode: string,
    getBundle: () => Promise<KeyBundle> = () => this.loadBundle(),
  ): Promise<UnlockResult> {
    const before = await this.limiter.status();
    if (before.blocked) return { ok: false, reason: 'paused', retryInMs: before.retryInMs };
    const bundle = await getBundle();
    const t0 = this.now();
    try {
      const dataKey = await run(bundle);
      await this.limiter.recordSuccess();
      return { ok: true, dataKey, ms: this.now() - t0 };
    } catch (e) {
      if (e instanceof CryptoError && e.code === wrongCode) {
        const s = await this.limiter.recordFailure();
        return { ok: false, reason: 'wrong', triesLeft: s.triesLeft, retryInMs: s.retryInMs };
      }
      throw e;
    }
  }

  unlock(passcode: string): Promise<UnlockResult> {
    const p = normalizePasscode(passcode);
    return this.attempt((b) => unlockWithPasscode(b, p), 'WRONG_PASSCODE');
  }

  unlockWithRecovery(recoveryKey: string): Promise<UnlockResult> {
    return this.attempt((b) => unlockWithRecoveryKey(b, recoveryKey), 'WRONG_RECOVERY_KEY');
  }

  /**
   * The part of the key bundle that is useful on a new phone: the data key wrapped by the recovery key.
   * It is encrypted, so it is safe to keep next to the database. Without the recovery key it is useless.
   */
  async getRecoveryBlob(): Promise<string> {
    const b = await this.loadBundle();
    return JSON.stringify({ v: b.v, wrappedByRecovery: b.wrappedByRecovery });
  }

  /**
   * New phone: the database came along but the keychain did not. Opens the data key with the recovery key and the
   * recovery blob stored in the database. Same try limit and pauses as every other unlock.
   */
  async restoreWithRecovery(recoveryBlob: string, recoveryKey: string): Promise<UnlockResult> {
    if (await this.isSetUp()) throw new Error('Vault is already set up');
    const stub = (): Promise<KeyBundle> => {
      const o = JSON.parse(recoveryBlob) as { wrappedByRecovery?: string };
      if (typeof o.wrappedByRecovery !== 'string') throw new CryptoError('CORRUPT', 'Recovery blob is unreadable');
      return Promise.resolve({ v: 1, kdf: this.kdf, salt: '', wrappedByPasscode: '', wrappedByRecovery: o.wrappedByRecovery });
    };
    return this.attempt((b) => unlockWithRecoveryKey(b, recoveryKey), 'WRONG_RECOVERY_KEY', stub);
  }

  /** Second half of a restore: wrap the recovered data key with a new passcode and store the key bundle. */
  async finishRestore(recoveryBlob: string, dataKey: Uint8Array, newPasscodeRaw: string): Promise<void> {
    const newPasscode = normalizePasscode(newPasscodeRaw);
    if (await this.isSetUp()) throw new Error('Vault is already set up');
    if (!isValidPasscode(newPasscode)) throw new Error('Passcode must be 6 digits or a passphrase of at least 10 characters');
    const o = JSON.parse(recoveryBlob) as { wrappedByRecovery: string };
    const base: KeyBundle = { v: 1, kdf: this.kdf, salt: '', wrappedByPasscode: '', wrappedByRecovery: o.wrappedByRecovery };
    const bundle = await changePasscode(base, dataKey, newPasscode, this.kdf);
    await this.store.set(BUNDLE_KEY, JSON.stringify(bundle));
    await this.store.set(KIND_KEY, passcodeKind(newPasscode));
    await this.limiter.recordSuccess();
  }

  /** Removes the key bundle and the attempt counter. Used only by "delete all data". */
  async reset(): Promise<void> {
    await this.store.remove(BUNDLE_KEY);
    await this.store.remove(KIND_KEY);
    await this.limiter.recordSuccess(); // clears the stored attempt counter
  }

  /** Needs the unlocked data key. Entries stay as they are. */
  async setNewPasscode(dataKey: Uint8Array, newPasscodeRaw: string): Promise<void> {
    const newPasscode = normalizePasscode(newPasscodeRaw);
    if (!isValidPasscode(newPasscode)) throw new Error('Passcode must be 6 digits or a passphrase of at least 10 characters');
    const bundle = await this.loadBundle();
    const next = await changePasscode(bundle, dataKey, newPasscode, this.kdf);
    await this.store.set(BUNDLE_KEY, JSON.stringify(next));
    await this.store.set(KIND_KEY, passcodeKind(newPasscode));
    await this.limiter.recordSuccess();
  }
}
