import type { KeyValueStore } from '../vault/store';
import { LANG_CHOICES, type LangChoice } from '../i18n/i18n';

export const LOCK_CHOICES = [0, 1, 5, 15] as const; // minutes; 0 = as soon as the app leaves the foreground
export const THEME_CHOICES = ['system', 'dark', 'light'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

export type Settings = {
  /** Minutes of inactivity before the diary locks. 0 = lock when the app is left. */
  lockMinutes: number;
  theme: ThemeChoice;
  /** Interface language: follow the phone, or English / German. */
  language: LangChoice;
  reminder: { enabled: boolean; hour: number; minute: number };
};

export const DEFAULT_SETTINGS: Settings = {
  lockMinutes: 5,
  theme: 'system',
  language: 'system',
  reminder: { enabled: false, hour: 21, minute: 0 },
};

const SETTINGS_KEY = 'diary.settings';

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Turns whatever was stored into valid settings. Every bad field falls back to its default on its own. */
export function parseSettings(raw: string | null): Settings {
  let o: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) o = parsed as Record<string, unknown>;
  } catch {
    // keep defaults
  }
  const r = o.reminder && typeof o.reminder === 'object' ? (o.reminder as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    lockMinutes: (LOCK_CHOICES as readonly unknown[]).includes(o.lockMinutes) ? (o.lockMinutes as number) : d.lockMinutes,
    theme: (THEME_CHOICES as readonly unknown[]).includes(o.theme) ? (o.theme as ThemeChoice) : d.theme,
    language: (LANG_CHOICES as readonly unknown[]).includes(o.language) ? (o.language as LangChoice) : d.language,
    reminder: {
      enabled: r.enabled === true,
      hour: isInt(r.hour, 0, 23) ? r.hour : d.reminder.hour,
      minute: isInt(r.minute, 0, 59) ? r.minute : d.reminder.minute,
    },
  };
}

/** Auto-lock limit in milliseconds, as the lock rules in autoLock.ts expect it. */
export const idleLimitMs = (s: Settings) => s.lockMinutes * 60_000;

export const formatTime = (hour: number, minute: number) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export class SettingsService {
  constructor(private store: KeyValueStore) {}

  async load(): Promise<Settings> {
    try {
      return parseSettings(await this.store.get(SETTINGS_KEY));
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async clear(): Promise<void> {
    await this.store.remove(SETTINGS_KEY);
  }

  async save(s: Settings): Promise<void> {
    await this.store.set(SETTINGS_KEY, JSON.stringify(parseSettings(JSON.stringify(s))));
  }
}
