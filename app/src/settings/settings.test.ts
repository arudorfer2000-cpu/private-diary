import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../vault/store';
import { DEFAULT_SETTINGS, SettingsService, idleLimitMs, parseSettings, type Settings } from './settings';
import { FORBIDDEN_WORDS, REMINDER_BODY, REMINDER_TITLE, applyReminder, type Notifier, type PermissionResult } from './reminder';
import { contrast, darkPalette, lightPalette, resolvePalette } from '../palettes';
import { shouldLockOnIdle, shouldLockOnReturn } from '../vault/autoLock';

test('T1 settings: defaults, field-by-field repair, allowed values only, round trip', async () => {
  const svc = new SettingsService(new MemoryStore());
  assert.deepEqual(await svc.load(), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.lockMinutes, 5);

  assert.deepEqual(parseSettings('not json {'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('[1,2,3]'), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('null'), DEFAULT_SETTINGS);
  const mixed = parseSettings(JSON.stringify({ lockMinutes: 7, theme: 'light', reminder: { enabled: true, hour: 25, minute: 30 } }));
  assert.equal(mixed.lockMinutes, 5, 'unknown lock value repaired');
  assert.equal(mixed.theme, 'light', 'good field kept');
  assert.equal(mixed.reminder.enabled, true);
  assert.equal(mixed.reminder.hour, 21, 'bad hour repaired');
  assert.equal(mixed.reminder.minute, 30, 'good minute kept');
  for (const bad of [-1, 24, 1.5, '8', null, NaN]) assert.equal(parseSettings(JSON.stringify({ reminder: { hour: bad } })).reminder.hour, 21);
  for (const bad of [-1, 60, 0.5]) assert.equal(parseSettings(JSON.stringify({ reminder: { minute: bad } })).reminder.minute, 0);
  assert.equal(parseSettings(JSON.stringify({ theme: 'neon' })).theme, 'system');
  for (const ok of [0, 1, 5, 15]) assert.equal(parseSettings(JSON.stringify({ lockMinutes: ok })).lockMinutes, ok);
  assert.equal(parseSettings(JSON.stringify({ reminder: { enabled: 'yes' } })).reminder.enabled, false, 'only true enables');

  const s: Settings = { lockMinutes: 0, theme: 'dark', language: 'de', reminder: { enabled: true, hour: 7, minute: 45 } };
  await svc.save(s);
  assert.deepEqual(await svc.load(), s);
  await svc.save({ ...s, lockMinutes: 99 }); // never stores invalid values
  assert.equal((await svc.load()).lockMinutes, 5);
});

test('T2 auto-lock setting in milliseconds feeds the lock rules', () => {
  assert.equal(idleLimitMs({ ...DEFAULT_SETTINGS, lockMinutes: 5 }), 300_000);
  assert.equal(idleLimitMs({ ...DEFAULT_SETTINGS, lockMinutes: 1 }), 60_000);
  assert.equal(idleLimitMs({ ...DEFAULT_SETTINGS, lockMinutes: 15 }), 900_000);
  assert.equal(idleLimitMs({ ...DEFAULT_SETTINGS, lockMinutes: 0 }), 0);
  const five = idleLimitMs(DEFAULT_SETTINGS);
  assert.equal(shouldLockOnIdle(0, five - 1, five), false);
  assert.equal(shouldLockOnIdle(0, five, five), true);
  assert.equal(shouldLockOnReturn(0, five - 1, five), false);
  assert.equal(shouldLockOnReturn(0, five, five), true);
  assert.equal(shouldLockOnReturn(0, 1, 0), true, 'limit 0 locks on any return');
});

class FakeNotifier implements Notifier {
  scheduled: { hour: number; minute: number; title: string; body: string }[] = [];
  asked = 0;
  constructor(private permission: PermissionResult = 'granted') {}
  async requestPermission() {
    this.asked++;
    return this.permission;
  }
  async cancelAll() {
    this.scheduled = [];
  }
  async scheduleDaily(hour: number, minute: number, title: string, body: string) {
    this.scheduled.push({ hour, minute, title, body });
  }
}

test('T3 (TC-18) reminder: one daily notification, replaced not doubled, cancelled when off, denied schedules nothing, neutral text', async () => {
  const n = new FakeNotifier();
  const on = { enabled: true, hour: 20, minute: 30 };
  assert.equal(await applyReminder(on, n), 'on');
  assert.equal(n.asked, 1);
  assert.deepEqual(n.scheduled.map((x) => [x.hour, x.minute]), [[20, 30]]);
  assert.equal(await applyReminder({ ...on, hour: 7, minute: 5 }, n), 'on');
  assert.deepEqual(n.scheduled.map((x) => [x.hour, x.minute]), [[7, 5]], 'replaced, not two');
  assert.equal(await applyReminder(on, n), 'on');
  assert.equal(await applyReminder(on, n), 'on'); // app start applies again: still exactly one
  assert.equal(n.scheduled.length, 1);
  assert.equal(await applyReminder({ ...on, enabled: false }, n), 'off');
  assert.equal(n.scheduled.length, 0);
  const asked = n.asked;
  await applyReminder({ ...on, enabled: false }, n);
  assert.equal(n.asked, asked, 'no permission prompt when off');

  const denied = new FakeNotifier('denied');
  assert.equal(await applyReminder(on, denied), 'denied');
  assert.equal(denied.scheduled.length, 0);
  const unsupported = new FakeNotifier('unsupported');
  assert.equal(await applyReminder(on, unsupported), 'unsupported');
  assert.equal(unsupported.scheduled.length, 0);

  const text = `${REMINDER_TITLE} ${REMINDER_BODY}`.toLowerCase();
  for (const w of FORBIDDEN_WORDS) assert.ok(!text.includes(w), `notification text must not contain "${w}"`);
  assert.deepEqual([...FORBIDDEN_WORDS].sort(), ['diary', 'entry', 'journal', 'passcode', 'private', 'secret']);
  assert.equal(n.scheduled.length, 0);
  await applyReminder(on, n);
  assert.equal(n.scheduled[0].title, REMINDER_TITLE);
  assert.equal(n.scheduled[0].body, REMINDER_BODY);
});

test('T4 theme: system follows the phone; palettes complete; contrast 4.5:1 or better', () => {
  assert.equal(resolvePalette('system', 'light'), lightPalette);
  assert.equal(resolvePalette('system', 'dark'), darkPalette);
  assert.equal(resolvePalette('system', null), darkPalette);
  assert.equal(resolvePalette('dark', 'light'), darkPalette);
  assert.equal(resolvePalette('light', 'dark'), lightPalette);
  assert.deepEqual(Object.keys(lightPalette).sort(), Object.keys(darkPalette).sort());
  for (const [name, p] of [['dark', darkPalette], ['light', lightPalette]] as const) {
    for (const v of Object.values(p)) assert.ok(typeof v === 'string' && v.length > 0);
    const pairs: [string, string, string][] = [
      ['text on bg', p.text, p.bg],
      ['dim text on bg', p.textDim, p.bg],
      ['faint text on bg', p.textFaint, p.bg],
      ['text on card', p.text, p.card],
      ['dim text on card', p.textDim, p.card],
      ['card body on card', p.cardBody, p.card],
      ['accent text on accent', p.accentText, p.accent],
      ['accent on bg', p.accent, p.bg],
      ['accent on card', p.accent, p.card],
    ];
    for (const [label, fg, bg] of pairs) {
      const c = contrast(fg, bg);
      assert.ok(c >= 4.5, `${name}: ${label} is ${c.toFixed(2)}:1`);
    }
  }
});
