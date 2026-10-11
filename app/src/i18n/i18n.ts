import { de } from './de';

export type Lang = 'en' | 'de';
export const LANG_CHOICES = ['system', 'en', 'de'] as const;
export type LangChoice = (typeof LANG_CHOICES)[number];

/** Device language "de", "de-DE", "de_AT" ... gives German; everything else English. */
export function resolveLang(choice: LangChoice, deviceLocale: string | null | undefined): Lang {
  if (choice === 'en' || choice === 'de') return choice;
  return /^de([-_]|$)/i.test(deviceLocale ?? '') ? 'de' : 'en';
}

export function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en';
  }
}

/** English text is the key. Unknown key or English: the text itself. `{name}` placeholders are filled from vars. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const text = lang === 'de' ? (de[key] ?? key) : key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;
export const makeT = (lang: Lang): TFn => (key, vars) => translate(lang, key, vars);

/** Texts that are looked up with a variable (month, weekday and mood names), so a scan of the source cannot see them. */
export const DYNAMIC_KEYS: string[] = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
  'A quiet moment', 'Take a minute for yourself.',
  'No entry', 'Very low', 'Low', 'Okay', 'Good', 'Great',
];
