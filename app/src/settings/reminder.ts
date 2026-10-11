import type { Settings } from './settings';
import { translate } from '../i18n/i18n';

/** Words that must never appear on a lock screen. */
export const FORBIDDEN_WORDS = ['diary', 'journal', 'entry', 'private', 'secret', 'passcode'];

export const REMINDER_TITLE = 'A quiet moment';
export const REMINDER_BODY = 'Take a minute for yourself.';

/** Notification text per language (the translation of the two English lines). */
export const REMINDER_TEXT = {
  en: { title: REMINDER_TITLE, body: REMINDER_BODY },
  de: { title: translate('de', REMINDER_TITLE), body: translate('de', REMINDER_BODY) },
};

export type PermissionResult = 'granted' | 'denied' | 'unsupported';

/** What the reminder needs from the phone. expo-notifications implements it; tests use a fake. */
export interface Notifier {
  requestPermission(): Promise<PermissionResult>;
  cancelAll(): Promise<void>;
  scheduleDaily(hour: number, minute: number, title: string, body: string): Promise<void>;
}

export type ReminderStatus = 'off' | 'on' | 'denied' | 'unsupported';

/**
 * Makes the phone match the settings: always cancels what was scheduled before, then schedules at most one new
 * daily notification. Safe to call at every app start.
 */
export async function applyReminder(s: Settings['reminder'], n: Notifier, text: { title: string; body: string } = REMINDER_TEXT.en): Promise<ReminderStatus> {
  await n.cancelAll();
  if (!s.enabled) return 'off';
  const p = await n.requestPermission();
  if (p === 'denied') return 'denied';
  if (p === 'unsupported') return 'unsupported';
  await n.scheduleDaily(s.hour, s.minute, text.title, text.body);
  return 'on';
}
