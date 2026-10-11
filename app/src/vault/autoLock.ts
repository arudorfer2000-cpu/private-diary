/**
 * Auto-lock rules (pure functions, so they can be tested without a phone).
 * limitMs is the user's idle limit. 0 means: lock as soon as the app leaves the foreground.
 */

/** While the app is open and untouched: lock when the idle time reaches the limit. */
export function shouldLockOnIdle(lastActiveMs: number, nowMs: number, limitMs: number): boolean {
  if (limitMs <= 0) return false; // 0 = only lock when leaving the app
  return nowMs - lastActiveMs >= limitMs;
}

/** When the app comes back from the background: lock if it was away for the limit or longer. */
export function shouldLockOnReturn(backgroundedAtMs: number, nowMs: number, limitMs: number): boolean {
  if (limitMs <= 0) return true;
  return nowMs - backgroundedAtMs >= limitMs;
}

export const DEFAULT_IDLE_LIMIT_MS = 5 * 60_000;
