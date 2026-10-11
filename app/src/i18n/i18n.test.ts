import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { translate, resolveLang, DYNAMIC_KEYS } from './i18n';
import { de } from './de';
import { parseSettings } from '../settings/settings';
import { REMINDER_TITLE, REMINDER_BODY, FORBIDDEN_WORDS, REMINDER_TEXT } from '../settings/reminder';

test('L1 translate: English default, German, placeholders, fallback', () => {
  assert.equal(translate('en', 'Settings'), 'Settings');
  assert.equal(translate('de', 'Settings'), 'Einstellungen');
  assert.equal(translate('en', 'Wrong {what}. {n} tries left before a pause.', { what: 'passcode', n: 3 }), 'Wrong passcode. 3 tries left before a pause.');
  assert.match(translate('de', 'Wrong {what}. {n} tries left before a pause.', { what: 'Code', n: 3 }), /Code.*3/);
  assert.equal(translate('de', 'No such key in the dictionary'), 'No such key in the dictionary');
  assert.equal(translate('de', 'Hello {x}', { y: 1 }), 'Hello {x}'); // unknown placeholder stays visible
});

const ROOT = join(import.meta.dirname, '..', '..');
function sources(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (['node_modules', 'dist-web', 'e2e', 'scripts', 'i18n'].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
  }
  return out;
}
const files = [join(ROOT, 'App.tsx'), ...sources(join(ROOT, 'src'))];
const used = new Set<string>();
for (const f of files) {
  const code = readFileSync(f, 'utf8');
  // t('...'), t("..."), t(`...`) with a literal first argument
  for (const m of code.matchAll(/\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g)) {
    used.add((m[1] ?? m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n'));
  }
}
const ALLOWED_SAME = new Set(['Markdown', 'JSON', 'Face ID', 'OK', 'System', 'English', 'Deutsch', 'April', 'August', 'September', 'November', 'Okay', 'Passphrase', 'Test']);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('L2 every used text has a German entry', () => {
  const missing = [...used, ...DYNAMIC_KEYS].filter((k) => !(k in de));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 100, `scan found only ${used.size} texts`);
});

test('L2 no unused German entries, matching placeholders, really translated', () => {
  const known = new Set([...used, ...DYNAMIC_KEYS]);
  assert.deepEqual(Object.keys(de).filter((k) => !known.has(k)), []);
  for (const [k, v] of Object.entries(de)) {
    assert.equal(placeholders(v), placeholders(k), `placeholders differ: ${k}`);
    if (!ALLOWED_SAME.has(k)) assert.notEqual(v, k, `not translated: ${k}`);
    assert.ok(v.trim().length > 0, `empty: ${k}`);
  }
});

test('L3 resolveLang and the stored setting', () => {
  assert.equal(resolveLang('system', 'de-DE'), 'de');
  assert.equal(resolveLang('system', 'de_AT'), 'de');
  assert.equal(resolveLang('system', 'de'), 'de');
  assert.equal(resolveLang('system', 'en-US'), 'en');
  assert.equal(resolveLang('system', 'fr-FR'), 'en');
  assert.equal(resolveLang('system', 'dev-DE'), 'en');
  assert.equal(resolveLang('system', undefined), 'en');
  assert.equal(resolveLang('en', 'de-DE'), 'en');
  assert.equal(resolveLang('de', 'en-US'), 'de');
  assert.equal(parseSettings(null).language, 'system');
  assert.equal(parseSettings(JSON.stringify({ language: 'de' })).language, 'de');
  assert.equal(parseSettings(JSON.stringify({ language: 'klingon' })).language, 'system');
});

test('L4 month, weekday and mood names and reminder text are German', () => {
  assert.equal(translate('de', 'March'), 'März');
  assert.equal(translate('de', 'Thursday'), 'Donnerstag');
  assert.equal(translate('de', 'Mon'), 'Mo');
  assert.equal(translate('de', 'Very low'), 'Sehr schlecht');
  assert.equal(REMINDER_TEXT.de.title, translate('de', REMINDER_TITLE));
  assert.equal(REMINDER_TEXT.de.body, translate('de', REMINDER_BODY));
  for (const lang of ['en', 'de'] as const) {
    const text = `${REMINDER_TEXT[lang].title} ${REMINDER_TEXT[lang].body}`.toLowerCase();
    for (const w of [...FORBIDDEN_WORDS, 'tagebuch', 'eintrag', 'privat', 'geheim', 'passwort', 'code']) assert.ok(!text.includes(w), `${lang}: ${w}`);
  }
});

import { exportMarkdown } from '../export/exporters';
import { makeT } from './i18n';

test('L4 export in German uses German words and month names; English default unchanged', () => {
  const item = { id: 'a', day: '2026-10-11', createdAt: 1, updatedAt: 1, deletedAt: null, entry: { title: '', text: 'Hallo', mood: 4, tags: [] } };
  const de = exportMarkdown([item as never], new Date('2026-10-12T10:00:00Z'), makeT('de'));
  assert.match(de, /Stimmung: Gut/);
  assert.match(de, /Oktober/);
  assert.match(de, /Ohne Titel/);
  assert.match(de, /Exportiert am 2026-10-12/);
  const en = exportMarkdown([item as never], new Date('2026-10-12T10:00:00Z'));
  assert.match(en, /Mood: Good/);
  assert.match(en, /October/);
});
