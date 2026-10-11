import type { KeyValueStore } from './store';

/** 5 free tries, then a pause of 30 s that doubles with every further failure, capped at 15 min. */
export const FREE_TRIES = 5;
export const BASE_DELAY_MS = 30_000;
export const MAX_DELAY_MS = 15 * 60_000;

export function delayAfterFailures(fails: number): number {
  if (fails < FREE_TRIES) return 0;
  return Math.min(BASE_DELAY_MS * 2 ** (fails - FREE_TRIES), MAX_DELAY_MS);
}

type State = { fails: number; lockedUntil: number };

export type LimiterStatus = {
  blocked: boolean;
  retryInMs: number;
  /** Tries before the next pause starts. After the first pause this is always 1. */
  triesLeft: number;
};

const KEY = 'diary.limiter';

/**
 * Counts wrong tries and persists the count, so closing and reopening the app does not reset it.
 * Known limit: it relies on the phone clock. Changing the phone clock can shorten a pause.
 */
export class AttemptLimiter {
  constructor(
    private store: KeyValueStore,
    private now: () => number,
  ) {}

  private async load(): Promise<State> {
    const raw = await this.store.get(KEY);
    if (!raw) return { fails: 0, lockedUntil: 0 };
    try {
      const s = JSON.parse(raw) as State;
      if (typeof s.fails === 'number' && typeof s.lockedUntil === 'number') return s;
    } catch {
      // fall through
    }
    // Unreadable state: be careful, start a pause.
    return { fails: FREE_TRIES, lockedUntil: this.now() + BASE_DELAY_MS };
  }

  private statusOf(s: State): LimiterStatus {
    const retryInMs = Math.min(Math.max(0, s.lockedUntil - this.now()), MAX_DELAY_MS);
    return {
      blocked: retryInMs > 0,
      retryInMs,
      triesLeft: s.fails < FREE_TRIES ? FREE_TRIES - s.fails : 1,
    };
  }

  async status(): Promise<LimiterStatus> {
    return this.statusOf(await this.load());
  }

  async recordFailure(): Promise<LimiterStatus> {
    const s = await this.load();
    const fails = s.fails + 1;
    const next: State = { fails, lockedUntil: delayAfterFailures(fails) > 0 ? this.now() + delayAfterFailures(fails) : 0 };
    await this.store.set(KEY, JSON.stringify(next));
    return this.statusOf(next);
  }

  async recordSuccess(): Promise<void> {
    await this.store.remove(KEY);
  }
}
