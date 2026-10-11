// Browser test of the real screens at iPhone size. The web app: sql.js and IndexedDB replace SQLite and the keychain.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const URL = process.env.APP_URL ?? 'http://localhost:8099/';
const SHOTS = process.env.SHOTS ?? '/tmp/claude-0/shots';
import { mkdirSync } from 'node:fs';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log('PASS', name);
  } catch (e) {
    await page.screenshot({ path: `${SHOTS}/FAIL-${results.length}.png` }).catch(() => {});
    console.log(String(e.stack).split('\n').filter((l) => l.includes('flow.mjs')).slice(0, 2).join(' | '));
    results.push(['FAIL', name, String(e.message).split('\n')[0]]);
    console.log('FAIL', name, '-', String(e.message).split('\n')[0]);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: { latitude: 40.71284, longitude: -74.00596 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const text = async () => await page.innerText('body');
const waitText = (t, timeout = 30000) => page.getByText(t, { exact: false }).first().waitFor({ timeout });
const pin = async (digits) => { for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click(); };
const btn = (name) => page.getByRole('button', { name, exact: false }).first();


// ---- accessibility scan (step 4.1) ----
const scan = async () => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const sel = '[role=button],[role=switch],[role=link],button,input,textarea,a[href]';
  const bad = [];
  let count = 0;
  let headings = 0;
  document.querySelectorAll('[role=heading]').forEach((h) => { if (vis(h)) headings++; });
  document.querySelectorAll(sel).forEach((el) => {
    if (!vis(el)) return;
    count++;
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.value || '').trim();
    const label = name || '(no name)';
    if (!name) bad.push(`no name: ${el.tagName}.${el.getAttribute('role')}`);
    if (r.width < 43.5 || r.height < 43.5) bad.push(`small ${Math.round(r.width)}x${Math.round(r.height)}: ${label.slice(0, 40)}`);
  });
  return { bad, count, headings };
});
const expectClean = async (where, wantHeading = true) => {
  const r = await scan();
  assert.deepEqual(r.bad, [], `${where}: ${r.bad.join('; ')}`);
  if (wantHeading) assert.ok(r.headings >= 1, `${where}: no heading`);
  return r.count;
};


// ---- IndexedDB access for the test (the web app keeps its key bundle and database file there) ----
const idbDo = (pg, op, arg) => pg.evaluate(([op, arg]) => new Promise((resolve, reject) => {
  // fixed operations only: the page's security policy forbids eval, as it should
  const q = indexedDB.open('private-diary', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('kv');
  q.onerror = () => reject(q.error);
  q.onsuccess = () => {
    const t = q.result.transaction('kv', op === 'keys' ? 'readonly' : 'readwrite');
    const s = t.objectStore('kv');
    const r = op === 'keys' ? s.getAllKeys() : op === 'delete' ? s.delete(arg) : s.clear();
    t.oncomplete = () => { q.result.close(); resolve(op === 'keys' ? r.result : undefined); };
    t.onerror = () => reject(t.error);
  };
}), [op, arg]);
const idbKeys = (pg) => idbDo(pg, 'keys');
const idbDelete = async (pg, re) => { for (const k of await idbKeys(pg)) if (re.test(k)) await idbDo(pg, 'delete', k); };
const idbClear = (pg) => idbDo(pg, 'clear');

const PASS = '482915';
let recoveryKey2 = '';

await page.goto(URL);
await check('setup: passcode creation, confirmation and recovery key', async () => {
  await waitText('Create your passcode');
  await pin(PASS);
  await waitText('Repeat your passcode');
  await pin(PASS);
  await waitText('Write down your recovery key', 60000);
  await shot('01-recovery');
  const t = await text();
  assert.ok(/[A-Z2-7]{4}/.test(t));
  await btn('I have written it down').click();
});
await check('calendar opens after setup, current month, empty', async () => {
  // optional Face ID stage is skipped in a browser
  await waitText('writing streak', 30000);
  await shot('02-calendar-empty');
  const t = await text();
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  assert.ok(t.includes(`${months[now.getMonth()]} ${now.getFullYear()}`), 'month title');
  assert.ok(t.includes('0 entries'), 'no entries yet');
  assert.ok(t.includes('0 days'), 'streak 0');
});

await check('layout: every calendar header button is fully inside the 390 px screen', async () => {
  for (const name of ['Settings', 'Search', 'Open trash', 'Lock diary now', 'Previous month']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, `${name} is off screen: ${JSON.stringify(box)}`);
  }
});

await check('write an entry with tags; autosave shows saved', async () => {
  await btn('Write').click();
  await page.getByLabel('Entry title').fill('First light');
  await page.getByLabel('Entry text').fill('Today I finally said it out loud.');
  await page.getByLabel('Add a tag').fill('family,');
  await page.getByLabel('Add a tag').fill('Work');
  await page.getByLabel('Add a tag').press('Enter');
  await page.getByLabel('Add a tag').fill('work'); // duplicate ignored
  await page.getByLabel('Add a tag').press('Enter');
  await page.getByLabel('Mood: Good').click().catch(() => {});
  await waitText('Saved and encrypted', 5000);
  await shot('03-editor');
  const t = await text();
  assert.ok(t.includes('#family') && t.includes('#Work'));
  assert.equal((t.match(/#work/gi) ?? []).length, 1, 'duplicate tag ignored');
});
await check('Done returns to calendar: entry counted, streak 1, preview shows text', async () => {
  await btn('Done').click();
  await waitText('1 entry');
  const t = await text();
  assert.ok(t.includes('1 day'), 'streak 1');
  assert.ok(t.includes('First light'), 'preview title');
  assert.ok(t.includes('Today I finally said it out loud.'));
  assert.ok(t.includes('#family') && t.includes('#Work'), 'tags in the day preview');
  await shot('04-calendar-with-entry');
});

await check('reload (app restart) then unlock: entry and tags survive', async () => {
  await page.reload();
  await waitText('Diary is locked');
  await pin(PASS);
  await waitText('writing streak', 60000);
  await waitText('First light');
  await btn('Edit').click();
  await waitText('#family');
  await waitText('#Work');
  await shot('05-reopened-editor');
  await btn('Done').click();
  await waitText('writing streak');
});

await check('wrong passcodes: tries left shown; 5th wrong try starts a pause that blocks even the right passcode', async () => {
  await btn('Lock diary now').click();
  await waitText('Diary is locked');
  await pin('111112');
  await waitText('4 tries left before a pause', 60000);
  await shot('06-wrong');
  for (const left of ['3 tries', '2 tries', '1 try']) {
    await pin('111112');
    await waitText(`${left} left before a pause`, 60000);
  }
  await pin('111112');
  await page.getByText(/wait|pause|seconds|try again in/i).first().waitFor({ timeout: 60000 });
  await shot('06b-paused');
  await pin(PASS); // right passcode during the pause must not open the diary
  await page.waitForTimeout(1500);
  assert.ok(!(await text()).includes('writing streak'), 'right passcode must be refused during the pause');
  // a fresh page load keeps the pause (stored), so clear the limiter for the remaining checks
  await idbDelete(page, /limiter|attempt/);
  await page.reload();
  await waitText('Diary is locked');
  await pin(PASS);
  await waitText('writing streak', 60000);
});

await check('move to trash: leaves calendar, shows in Trash with days left, restore brings it back', async () => {
  if (!(await text()).includes('writing streak')) { await waitText('Diary is locked'); await pin(PASS); await waitText('writing streak', 60000); }
  await btn('Edit').click();
  await btn('Move to trash').click();
  await waitText('0 entries');
  assert.ok(!(await text()).includes('First light'));
  await btn('Open trash').click();
  await waitText('Trash');
  await waitText('30 days left');
  await shot('07-trash');
  assert.ok((await text()).includes('First light'));
  await btn('Restore').click();
  await waitText('The trash is empty.');
  await btn('Back to calendar').click();
  await waitText('1 entry');
  assert.ok((await text()).includes('First light'));
});

await check('delete forever needs a second tap', async () => {
  await btn('Edit').click();
  await btn('Move to trash').click();
  await btn('Open trash').click();
  await btn('Delete forever').click();
  await waitText('Tap again to delete');
  assert.ok((await text()).includes('First light'), 'still there after one tap');
  await btn('Tap again to delete').click();
  await waitText('The trash is empty.');
  await btn('Back to calendar').click();
  await waitText('0 entries');
});

await check('past date in the previous month can be written and shows there', async () => {
  await btn('Previous month').click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^15 .*no entry/ }).click();
  await btn('Write').click();
  await page.getByLabel('Entry text').fill('A day from last month.');
  await waitText('Saved and encrypted', 5000);
  await btn('Done').click();
  await waitText('1 entry');
  await shot('08-previous-month');
  await btn('Next month').click();
  await waitText('0 entries');
  assert.ok(!(await text()).includes('A day from last month.'));
});

await check('B1 search: word, tag, mood filter, no results, open result; no network requests', async () => {
  // make two more entries today-ish so there is something to filter
  const write = async (title, text, tag, moodLabel) => {
    await btn('Write').click();
    await page.getByLabel('Entry title').fill(title);
    await page.getByLabel('Entry text').fill(text);
    await page.getByLabel('Add a tag').fill(tag);
    await page.getByLabel('Add a tag').press('Enter');
    await page.getByLabel(new RegExp('^Mood: ' + moodLabel)).click();
    await waitText('Saved and encrypted', 5000);
    await btn('Done').click();
    await waitText('writing streak');
  };
  // today is empty (earlier check deleted it); write today, then yesterday
  await write('Quiet morning', 'Tea by the window and a long silence.', 'calm', 'Great');
  const prevDay = await page.getByRole('button', { name: /^\d+ .*no entry/ }).first();
  await prevDay.click();
  await write('Heavy day', 'Could not stop thinking about the café talk.', 'work', 'Very low');

  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await btn('Search').click();
  await waitText('Searched on this device');
  await waitText('3 entries'); // today, the 1st, and the entry from last month
  await page.getByLabel('Search your diary').fill('silence');
  await waitText('1 entry found');
  assert.ok((await text()).includes('Quiet morning') && !(await text()).includes('Heavy day'));
  await page.getByLabel('Search your diary').fill('CAFE');
  await waitText('1 entry found');
  assert.ok((await text()).includes('Heavy day'), 'accent-insensitive: cafe finds café');
  await page.getByLabel('Search your diary').fill('');
  await btn('Filter tag: calm').click();
  await waitText('1 entry found');
  assert.ok((await text()).includes('Quiet morning'));
  await btn('Filter tag: calm').click(); // off
  await waitText('3 entries');
  await btn('Filter mood: Very low').click();
  await waitText('1 entry found');
  assert.ok((await text()).includes('Heavy day') && !(await text()).includes('Quiet morning'));
  await shot('09-search');
  await page.getByLabel('Search your diary').fill('zzzz-not-there');
  await waitText('No entries found');
  await page.getByLabel('Search your diary').fill('');
  await btn('Filter mood: Very low').click(); // off
  await waitText('3 entries');
  await page.getByLabel('Search your diary').fill('heavy');
  await btn('Open entry from').click();
  await waitText('Could not stop thinking');
  await btn('Done').click();
  await waitText('Searched on this device'); // returns to the search list
  await btn('Back to calendar').click();
  await waitText('writing streak');
  assert.deepEqual(requests, [], 'no network requests while searching');
});

const bgOf = () => page.evaluate(() => {
  let el = document.elementFromPoint(6, 420);
  while (el) {
    const c = getComputedStyle(el).backgroundColor;
    if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
    el = el.parentElement;
  }
  return 'none';
});
const lum = (css) => { const [r, g, b] = css.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

await check('S1 settings screen: choices shown; lock time and theme persist after reload; the web version explains that reminders are not available', async () => {
  await btn('Settings').click();
  await waitText('Auto-lock');
  const t = await text();
  for (const w of ['Immediately', '1 min', '5 min', '15 min', 'Daily reminder', 'System', 'Dark', 'Light']) assert.ok(t.includes(w), w);
  assert.equal(await page.getByRole('button', { name: '5 min', exact: true }).getAttribute('aria-selected'), 'true', 'default is 5 min');
  await page.getByRole('button', { name: '15 min', exact: true }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await waitText('The web version cannot send reminders'); // the reminder switch exists in the iPhone build only (unit-tested in settings.test.ts)
  await shot('10-settings-light');
  assert.ok(lum(await bgOf()) > 0.8, 'light background after choosing Light');
  await page.reload();
  await waitText('Diary is locked');
  assert.ok(lum(await bgOf()) > 0.8, 'theme is already light on the passcode screen');
  await shot('11-passcode-light');
  await pin(PASS);
  await waitText('writing streak', 60000);
  await btn('Settings').click();
  await waitText('Auto-lock');
  assert.equal(await page.getByRole('button', { name: '15 min', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Light', exact: true }).getAttribute('aria-selected'), 'true');
  await btn('Back to calendar').click();
  await waitText('writing streak');
});

await check('S3 light theme: every screen readable (screenshots) and text/background really differ', async () => {
  await waitText('writing streak');
  await shot('12-calendar-light');
  await btn('Search').click();
  await waitText('Searched on this device');
  await shot('13-search-light');
  await btn('Back to calendar').click();
  await btn('Open trash').click();
  await waitText('The trash is empty');
  await shot('14-trash-light');
  await btn('Back to calendar').click();
  await page.getByRole('button', { name: /^(Write|Edit)$/ }).click();
  await shot('15-editor-light');
  await btn('Discard changes').click();
  await waitText('writing streak');
  assert.ok(lum(await bgOf()) > 0.8);
});

await check('S2 (TC-13) auto-lock: 5 min stays open at 4 min idle, locks by 6 min; 1 min locks by 90 s', async () => {
  const p2 = await ctx.newPage();
  await p2.clock.install();
  const errs = [];
  p2.on('pageerror', (e) => errs.push(String(e)));
  const t2 = async () => await p2.innerText('body');
  const wait2 = (t, ms = 60000) => p2.getByText(t, { exact: false }).first().waitFor({ timeout: ms });
  const pin2 = async (d) => { for (const c of d) await p2.getByRole('button', { name: c, exact: true }).click(); };
  await p2.goto(URL);
  try {
    await wait2('Diary is locked');
  } catch (e) {
    const seen = (await t2().catch(() => '?')).replace(/\s+/g, ' ').slice(0, 300);
    await p2.screenshot({ path: `${SHOTS}/S2-startup-timeout.png` }).catch(() => {});
    throw new Error(`startup of the second page timed out; page text: "${seen}"; page errors: ${errs.join(' | ')}`);
  }
  await pin2(PASS);
  await wait2('writing streak');
  await p2.getByRole('button', { name: 'Settings', exact: true }).click();
  await p2.getByRole('button', { name: '5 min', exact: true }).click(); // counts as activity
  await p2.clock.fastForward(4 * 60 * 1000);
  await p2.waitForTimeout(300);
  assert.ok((await t2()).includes('Auto-lock'), 'still open after 4 minutes');
  await p2.clock.fastForward(2 * 60 * 1000);
  await wait2('Diary is locked', 10000);
  await pin2(PASS);
  await wait2('writing streak');
  await p2.getByRole('button', { name: 'Settings', exact: true }).click();
  await p2.getByRole('button', { name: '1 min', exact: true }).click();
  await p2.clock.fastForward(30 * 1000);
  await p2.waitForTimeout(300);
  assert.ok((await t2()).includes('Auto-lock'), 'still open after 30 seconds on 1 minute');
  await p2.clock.fastForward(60 * 1000);
  await wait2('Diary is locked', 10000);
  assert.deepEqual(errs, []);
  await p2.close();
});

await check('E1 export: warning first, then Markdown and JSON downloads match the diary; cancel exports nothing', async () => {
  if (!(await text()).includes('writing streak')) { await waitText('Diary is locked'); await pin(PASS); await waitText('writing streak', 60000); }
  await btn('Settings').click();
  await waitText('Your data');
  await btn('Export as JSON').click();
  await waitText('This file is not encrypted');
  let downloads = 0;
  page.on('download', () => downloads++);
  await btn('Cancel export').click();
  await page.waitForTimeout(400);
  assert.equal(downloads, 0, 'cancel exports nothing');
  await btn('Export as Markdown').click();
  await waitText('This file is not encrypted');
  await shot('16-export-warning');
  const [mdDl] = await Promise.all([page.waitForEvent('download'), btn('Export unencrypted file').click()]);
  assert.match(mdDl.suggestedFilename(), /^private-diary-\d{4}-\d{2}-\d{2}\.md$/);
  const md = (await import('node:fs')).readFileSync(await mdDl.path(), 'utf8');
  for (const w of ['# Private Diary', 'Quiet morning', 'Tea by the window and a long silence.', 'Heavy day', 'A day from last month.', '#calm', 'Mood: Great', 'Mood: Very low']) assert.ok(md.includes(w), 'markdown has: ' + w);
  assert.equal(md.split('\n').filter((l) => l.startsWith('## ')).length, 3);
  await waitText('Export finished');
  await btn('Export as JSON').click();
  const [jsDl] = await Promise.all([page.waitForEvent('download'), btn('Export unencrypted file').click()]);
  assert.match(jsDl.suggestedFilename(), /\.json$/);
  const j = JSON.parse((await import('node:fs')).readFileSync(await jsDl.path(), 'utf8'));
  assert.equal(j.count, 3);
  assert.deepEqual(j.entries.map((e) => e.title).sort(), ['', 'Heavy day', 'Quiet morning']);
  assert.ok(j.entries.some((e) => e.text === 'Could not stop thinking about the café talk.' && e.tags.includes('work') && e.mood === 1));
  const raw = JSON.stringify(j).toLowerCase();
  for (const bad of ['passcode', 'datakey', 'wrapped']) assert.ok(!raw.includes(bad), bad);
  await btn('Back to calendar').click();
  await waitText('writing streak');
});

await check('X5 export formats: plain text, Word and PDF are offered, warned and downloaded with the diary content', async () => {
  const fs = await import('node:fs');
  await btn('Settings').click();
  await waitText('Your data');
  await expectClean('settings with five export formats');
  for (const [label, ext] of [['Export as plain text', 'txt'], ['Export as Word', 'docx'], ['Export as PDF', 'pdf']]) {
    await btn(label).click();
    await waitText('This file is not encrypted');
    if (ext === 'pdf') {
      // the web app opens the print dialog (Save as PDF); the test reads the page that was handed to it
      await page.evaluate(() => {
        window.__pdfHtml = null;
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.tagName === 'IFRAME') window.__pdfHtml = n.srcdoc; }))).observe(document.body, { childList: true });
      });
      await btn('Export unencrypted file').click();
      await waitText('Export finished');
      const body = await page.evaluate(() => window.__pdfHtml);
      assert.ok(body && body.startsWith('<!doctype html>') && !/<script/i.test(body), 'print page');
      assert.ok(body.includes('Quiet morning') && body.includes('Heavy day') && body.includes('A day from last month.'), label);
      continue;
    }
    const [dl] = await Promise.all([page.waitForEvent('download'), btn('Export unencrypted file').click()]);
    assert.match(dl.suggestedFilename(), new RegExp(`^private-diary-\\d{4}-\\d{2}-\\d{2}\\.${ext.replace('.', '\\.')}$`));
    const buf = fs.readFileSync(await dl.path());
    if (ext === 'docx') {
      assert.equal(buf.subarray(0, 4).toString('hex'), '504b0304', 'zip signature');
      const raw = buf.toString('utf8');
      assert.ok(raw.includes('word/document.xml') && raw.includes('Quiet morning') && raw.includes('Tea by the window and a long silence.'));
    } else {
      const body = buf.toString('utf8');
      assert.ok(body.includes('Quiet morning') && body.includes('Heavy day') && body.includes('A day from last month.'), label);
    }
    await waitText('Export finished');
  }
  await btn('Back to calendar').click();
  await waitText('writing streak');
});

await check('E2 delete all data: needs DELETE typed; then setup screen again, old data and passcode gone', async () => {
  await btn('Settings').click();
  await btn('Delete all data').click();
  const del = page.getByRole('button', { name: 'Delete everything', exact: true });
  await page.getByLabel('Type DELETE to confirm').fill('DELET');
  assert.equal(await del.getAttribute('aria-disabled'), 'true', 'disabled until the word is complete');
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  assert.equal(await del.getAttribute('aria-disabled'), 'true', 'case matters');
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  assert.notEqual(await del.getAttribute('aria-disabled'), 'true');
  await shot('17-delete-confirm');
  await del.click();
  await waitText('Create your passcode', 60000);
  assert.deepEqual((await idbKeys(page)).filter((k) => /diary\.(bundle|limiter|settings)/.test(k)), []);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0, 'nothing in localStorage');
  await page.reload();
  await waitText('Create your passcode');
  await pin('739104');
  await waitText('Repeat your passcode');
  await pin('739104');
  await waitText('Write down your recovery key', 60000);
  recoveryKey2 = ((await page.locator('[aria-label^="Recovery key:"]').getAttribute('aria-label')) ?? '').replace('Recovery key: ', '');
  assert.match(recoveryKey2, /^([A-Z2-7]{4} ){12}[A-Z2-7]{4}$/);
  await btn('I have written it down').click();
  await waitText('writing streak', 30000);
  assert.ok((await text()).includes('0 entries'), 'diary is empty');
  await btn('Settings').click();
  assert.equal(await page.getByRole('button', { name: '5 min', exact: true }).getAttribute('aria-selected'), 'true', 'settings back to defaults');
  assert.equal(await page.getByRole('button', { name: 'System', exact: true }).getAttribute('aria-selected'), 'true', 'theme back to System');
  await btn('Back to calendar').click();
  await btn('Search').click();
  await waitText('No entries yet');
  await btn('Back to calendar').click();
});

await check('M1/M2 dictation hint: Dictate opens the focused editor with the keyboard hint and no made-up text; hint hides once typing starts; leaving empty creates nothing', async () => {
  await waitText('writing streak');
  await btn('Dictate').click();
  await waitText('Tap the microphone on your keyboard to dictate');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Entry text', 'text field focused');
  assert.equal(await page.getByLabel('Entry text').inputValue(), '', 'no text of its own');
  assert.equal(await page.getByLabel('Entry title').inputValue(), '');
  const t = await text();
  assert.ok(t.includes('iOS does the voice recognition, not this app'));
  assert.ok(!/Mara|angry|tired/i.test(t), 'no sample text');
  await shot('18-dictation-hint');
  await page.getByLabel('Entry text').fill('hello');
  await page.waitForTimeout(200);
  assert.ok(!(await text()).includes('Tap the microphone on your keyboard'), 'hint hidden while there is text');
  await page.getByLabel('Entry text').fill('');
  await waitText('Tap the microphone on your keyboard to dictate');
  await btn('Discard changes').click();
  await waitText('0 entries');
  await btn('Write').click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Entry text', 'Write also focuses the text field');
  await btn('Done').click();
  await waitText('0 entries'); // nothing typed, nothing saved
});

const newPhone = async () => {
  // keychain does not travel to a new phone; the database does
  await idbDelete(page, /diary\.(bundle|limiter|settings|bioflag|biokey|passcodeKind)/);
  await page.reload();
};

await check('B1 (1.6) restore on a new phone: wrong key refused, right key then new passcode brings the entries back', async () => {
  // an entry to restore
  await page.getByRole('button', { name: /^(Write|Edit)$/ }).click();
  await page.getByLabel('Entry title').fill('Restore me');
  await page.getByLabel('Entry text').fill('These words must survive the phone change.');
  await waitText('Saved and encrypted', 5000);
  await btn('Done').click();
  await waitText('1 entry');
  await newPhone();
  await waitText('Restore your diary');
  await shot('19-restore-intro');
  await btn('Enter recovery key').click();
  await page.getByLabel('Recovery key').fill('AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH 2222 3333 4444 5555 6666');
  await btn('Restore diary').click();
  await waitText('Wrong recovery key. 4 tries left', 60000);
  await page.getByLabel('Recovery key').fill(recoveryKey2.toLowerCase());
  await btn('Restore diary').click();
  await waitText('Choose a new passcode', 60000);
  await pin('246810');
  await waitText('Repeat your passcode');
  await pin('246810');
  await waitText('writing streak', 60000);
  await waitText('Restore me');
  assert.ok((await text()).includes('These words must survive the phone change.'));
  await page.reload();
  await waitText('Diary is locked'); // no restore offered any more
  await pin('739104'); // the old passcode means nothing now
  await waitText('Wrong passcode', 60000);
  await pin('246810');
  await waitText('Restore me', 60000);
});

await check('B2 (1.6) "Start a new diary instead" needs DELETE, then first-time setup with an empty diary', async () => {
  await btn('Lock diary now').click();
  await newPhone();
  await waitText('Restore your diary');
  await btn('Start a new diary instead').click();
  const erase = page.getByRole('button', { name: 'Erase old diary', exact: true });
  assert.equal(await erase.getAttribute('aria-disabled'), 'true');
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  assert.notEqual(await erase.getAttribute('aria-disabled'), 'true');
  await erase.click();
  await waitText('Create your passcode', 30000);
  await page.reload();
  await waitText('Create your passcode'); // no restore offered: the old data is gone
  await pin('135790');
  await waitText('Repeat your passcode');
  await pin('135790');
  await waitText('Write down your recovery key', 60000);
  await btn('I have written it down').click();
  await waitText('writing streak', 30000);
  assert.ok((await text()).includes('0 entries'));
  assert.ok(!(await text()).includes('Restore me'));
});

await check('X1-X3 accessibility scan: names, 44 pt targets and headings on every screen', async () => {
  let n = 0;
  await btn('Lock diary now').click();
  await waitText('Diary is locked');
  n += await expectClean('unlock');
  await pin('135790');
  await waitText('writing streak', 60000);
  n += await expectClean('calendar');
  await btn('Write').click().catch(async () => { await btn('Edit').click(); });
  await page.getByLabel('Entry text').waitFor();
  await page.getByLabel('Entry text').fill('Scan entry');
  await page.getByLabel('Add a tag').fill('scan');
  await page.keyboard.press('Enter');
  n += await expectClean('editor');
  // X4: mood buttons say name + state; X5: save status is in a live region
  assert.ok(await page.getByRole('button', { name: /^Mood: /, exact: false }).count() >= 5, 'mood buttons named');
  assert.equal(await page.locator('[aria-selected=true][aria-label^="Mood: "]').count(), 1, 'exactly one mood selected');
  await page.locator('[aria-live=polite]', { hasText: /Saved|Saving/i }).first().waitFor({ timeout: 5000 });
  await btn('Done').click();
  await waitText('writing streak');
  assert.ok(await page.locator('[aria-label*=", entry written, mood "]').count() >= 1, 'calendar day names its mood');
  assert.ok(await page.locator('[aria-label*=", selected"]').count() >= 1, 'selected day announced');
  await btn('Search').click();
  await page.getByLabel('Search your diary').waitFor();
  n += await expectClean('search');
  await btn('Back to calendar').click();
  await btn('Open trash').click();
  await waitText('Trash');
  n += await expectClean('trash');
  await btn('Back to calendar').click();
  await btn('Settings').click();
  await waitText('Auto-lock');
  n += await expectClean('settings');
  await btn('Export as Markdown').click();
  n += await expectClean('settings, export panel');
  await btn('Cancel export').click();
  await btn('Delete all data').click();
  n += await expectClean('settings, delete confirm');
  await btn('Cancel delete').click();
  await btn('Back to calendar').click();
  await btn('Lock diary now').click();
  await waitText('Diary is locked');
  console.log('  scanned elements:', n);
  assert.ok(n > 40);
});

await check('P6/P7 passphrase option: weak and mismatching phrases refused, restart shows a text field (no digit pad), wrong phrase counts tries, right phrase opens; screens pass the accessibility scan', async () => {
  const PHRASE = 'blue kettle sings at dawn';
  await idbClear(page);
  await page.reload();
  await waitText('Create your passcode');
  await btn('Use a passphrase instead').click();
  await page.getByLabel('Passphrase').waitFor();
  assert.equal(await page.getByRole('button', { name: '1', exact: true }).count(), 0, 'no digit pad on the passphrase screen');
  await expectClean('create passphrase');
  await page.getByLabel('Passphrase').fill('short');
  assert.equal(await btn('Continue').getAttribute('aria-disabled'), 'true');
  await page.getByLabel('Passphrase').fill('aaaaaaaaaaaa');
  await btn('Continue').click();
  await waitText('Too easy to guess');
  await page.getByLabel('Passphrase').fill(PHRASE);
  await btn('Continue').click();
  await waitText('Repeat your passcode');
  await expectClean('confirm passphrase');
  await page.getByLabel('Repeat passphrase').fill('blue kettle sings at dusk');
  await btn('Confirm passphrase').click();
  await waitText('did not match');
  await page.getByLabel('Passphrase').fill(PHRASE);
  await btn('Continue').click();
  await page.getByLabel('Repeat passphrase').fill(PHRASE);
  await btn('Confirm passphrase').click();
  await waitText('Write down your recovery key', 60000);
  await btn('I have written it down').click();
  await waitText('writing streak', 30000);
  await page.reload();
  await waitText('Diary is locked');
  await page.getByLabel('Passphrase').waitFor();
  assert.equal(await page.getByRole('button', { name: '1', exact: true }).count(), 0, 'unlock shows a text field');
  await expectClean('unlock passphrase');
  await page.getByLabel('Passphrase').fill('blue kettle sings at dusk');
  await btn('Unlock').click();
  await waitText('4 tries left', 60000);
  await page.getByLabel('Passphrase').fill(PHRASE);
  await btn('Unlock').click();
  await waitText('writing streak', 60000);
});

await check('L6 language setting: Deutsch switches the screen at once and survives a reload; Device returns to English', async () => {
  await btn('Settings').click();
  await waitText('Auto-lock');
  await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
  await waitText('Einstellungen');
  await waitText('Automatische Sperre');
  await page.reload();
  await waitText('Tagebuch ist gesperrt');
  await page.getByLabel('Passphrase').fill('blue kettle sings at dawn');
  await page.getByRole('button', { name: 'Entsperren', exact: true }).click();
  await waitText('Schreibserie', 60000);
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Gerät', exact: true }).click();
  await waitText('Auto-lock'); // headless Chromium reports an English locale
  await btn('Back to calendar').click();
});

await check('L5 German interface (locale de-DE): every screen is German, no English UI text is left, scan and layout still pass', async () => {
  const { readFileSync } = await import('node:fs');
  const deSrc = readFileSync(new globalThis.URL('../src/i18n/de.ts', import.meta.url), 'utf8');
  const keys = [...deSrc.matchAll(/^  '((?:[^'\\]|\\.)*)': '((?:[^'\\]|\\.)*)',$/gm)].map((m) => [m[1].replace(/\\'/g, "'"), m[2].replace(/\\'/g, "'")]);
  const english = new Set(keys.filter(([k, v]) => k !== v && !k.includes('{')).map(([k]) => k));
  const stop = /\b(the|your|you|and|is|are|this|with|for|nothing|will|can|have|written|entries|entry)\b/i;
  const dctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const dp = await dctx.newPage();
  const derrs = [];
  dp.on('pageerror', (e) => derrs.push(String(e)));
  const seen = new Set();
  const visit = async (where) => {
    const items = await dp.evaluate(() => {
      const out = [];
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      document.querySelectorAll('*').forEach((el) => {
        if (!vis(el)) return;
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) out.push(n.textContent.trim());
        for (const a of ['aria-label', 'placeholder']) if (el.getAttribute(a)) out.push(el.getAttribute(a));
      });
      return out;
    });
    await dp.screenshot({ path: `${SHOTS}/de-${where.replace(/ /g, '_')}.png` });
    const bad = items.filter((t) => english.has(t) || (stop.test(t) && !t.includes('Scan German')));
    assert.deepEqual(bad, [], `${where}: untranslated English: ${bad.join(' | ')}`);
    items.forEach((t) => seen.add(t));
    const r = await dp.evaluate(() => [...document.querySelectorAll('[role=button],[role=switch],input,textarea')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => { const b = el.getBoundingClientRect(); return { n: el.getAttribute('aria-label') || el.innerText || el.placeholder || '(no name)', w: b.width, h: b.height, l: b.left, rr: b.right }; }));
    const small = r.filter((x) => x.w < 43.5 || x.h < 43.5 || x.l < -0.5 || x.rr > 390.5);
    assert.deepEqual(small.map((x) => `${x.n} ${Math.round(x.w)}x${Math.round(x.h)} @${Math.round(x.l)}-${Math.round(x.rr)}`), [], `${where}: size or bounds`);
    const hd = await dp.locator('[role=heading]').count();
    assert.ok(hd >= 1, `${where}: heading`);
  };
  const dtext = (t, ms = 60000) => dp.getByText(t, { exact: false }).first().waitFor({ timeout: ms });
  const dpin = async (d) => { for (const c of d) await dp.getByRole('button', { name: c, exact: true }).click(); };
  await dp.goto(URL);
  await dtext('Lege deinen Code fest');
  await visit('Einrichtung');
  await dp.getByRole('button', { name: /Passphrase instead|Stattdessen eine Passphrase/ }).click();
  await visit('Einrichtung Passphrase');
  await dp.getByRole('button', { name: /Stattdessen 6 Ziffern/ }).click();
  await dpin('482915');
  await dtext('Wiederhole deinen Code');
  await visit('Bestätigen');
  await dpin('482915');
  await dtext('Schreibe deinen Wiederherstellungsschlüssel auf');
  await visit('Wiederherstellungsschlüssel');
  await dp.getByRole('button', { name: 'Ich habe ihn aufgeschrieben' }).click();
  await dtext('Schreibserie', 30000);
  await visit('Kalender');
  await dp.getByRole('button', { name: 'Auswertung', exact: true }).click();
  await dtext('Schreibe zuerst ein paar Einträge');
  await visit('Auswertung leer');
  await dp.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  const body = await dp.innerText('body');
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  assert.ok(months.some((m) => body.includes(m)), 'German month name');
  assert.ok(body.includes('Mo') && body.includes('So'), 'German weekday letters');
  assert.ok(body.includes('0 Einträge') && body.includes('0 Tage'), 'German counts');
  await dp.getByRole('button', { name: 'Schreiben', exact: true }).click();
  await dp.getByLabel('Text des Eintrags').fill('Scan German');
  await dp.getByLabel('Tag hinzufügen').fill('abend');
  await dp.keyboard.press('Enter');
  await dp.getByText('Gespeichert und verschlüsselt').waitFor({ timeout: 10000 });
  await visit('Editor');
  assert.ok(await dp.locator('[aria-label^="Stimmung: "]').count() >= 5, 'German mood buttons');
  await dp.getByRole('button', { name: 'Fertig', exact: true }).click();
  await dtext('Schreibserie');
  assert.ok((await dp.innerText('body')).includes('1 Eintrag'), 'one entry in German');
  assert.ok(await dp.locator('[aria-label*="Eintrag geschrieben, Stimmung"]').count() >= 1, 'German day label');
  await dp.getByRole('button', { name: 'Auswertung', exact: true }).click();
  await dtext('Stimmung pro Woche');
  await visit('Auswertung');
  await dp.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await dp.getByRole('button', { name: 'Suche', exact: true }).click();
  await dp.getByLabel('Tagebuch durchsuchen').waitFor();
  await visit('Suche');
  await dp.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await dp.getByRole('button', { name: 'Papierkorb öffnen' }).click();
  await dtext('Der Papierkorb ist leer');
  await visit('Papierkorb');
  await dp.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await dp.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await dtext('Automatische Sperre');
  await visit('Einstellungen');
  await dtext('Die Web-Version kann keine Erinnerungen senden');
  await visit('Einstellungen Erinnerung');
  await dp.getByRole('button', { name: 'Als Markdown exportieren' }).click();
  await visit('Einstellungen Export');
  await dp.getByRole('button', { name: 'Export abbrechen' }).click();
  await dp.getByRole('button', { name: 'Alle Daten löschen', exact: true }).click();
  await visit('Einstellungen Löschen');
  await dp.getByRole('button', { name: 'Löschen abbrechen' }).click();
  await dp.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await dp.getByRole('button', { name: 'Tagebuch jetzt sperren' }).click();
  await dtext('Tagebuch ist gesperrt');
  await visit('Gesperrt');
  await dpin('739104');
  await dtext('Falscher Code. Noch 4 Versuche vor einer Pause.', 60000);
  await visit('Falscher Code');
  await dp.getByRole('button', { name: 'Meinen Wiederherstellungsschlüssel nutzen' }).click();
  await visit('Wiederherstellungsschlüssel eingeben');
  await dp.getByRole('button', { name: 'Zurück zum Code' }).click();
  // new phone: the keychain is gone, the database stays
  await idbDelete(dp, /diary\.(bundle|limiter|settings|bioflag|biokey|passcodeKind)/);
  await dp.reload();
  await dtext('Tagebuch wiederherstellen');
  await visit('Wiederherstellen');
  await dp.getByRole('button', { name: 'Stattdessen ein neues Tagebuch beginnen' }).click();
  await visit('Neues Tagebuch');
  assert.ok(seen.size > 60, `walked ${seen.size} distinct texts`);
  assert.deepEqual(derrs, []);
  await dctx.close();
});

await check('M6 import: preview counts, confirm adds, same file again adds nothing, invalid files refused, German texts, scan passes', async () => {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const pym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const mk = (id, date, text, extra = {}) => ({ id, date, mood: 4, title: 'Imp ' + id.slice(0, 3), text, tags: ['importiert'], createdAt: `${date}T08:00:00.000Z`, updatedAt: `${date}T08:00:00.000Z`, ...extra });
  const fileJson = JSON.stringify({ app: 'Private Diary', format: 1, entries: [
    mk('aaaaaaaa11111111', `${ym}-01`, 'importiertes-wort eins'),
    mk('bbbbbbbb22222222', `${ym}-02`, 'zweiter importierter Tag'),
    mk('cccccccc33333333', `${pym}-15`, 'Eintrag im Vormonat'),
    mk('dddddddd44444444', '2026-99-99', 'kaputtes Datum'),
  ] });
  const choose = async (content, label = 'Import from a file') => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), btn(label).click()]);
    await fc.setFiles({ name: 'diary-export.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  };
  await btn('Settings').click();
  await waitText('Auto-lock');
  await choose(fileJson);
  await waitText('Found 3 entries, 3 of them new.');
  await waitText('Entries that could not be read and will be skipped: 1.');
  await expectClean('import panel');
  await btn('Import 3 entries').click();
  await waitText('Imported 3 entries.');
  assert.equal(await page.getByRole('button', { name: 'Import 3 entries', exact: true }).count(), 0, 'panel closed after import');
  // same file again: nothing new, nothing changes
  await choose(fileJson);
  await waitText('Nothing new to import.');
  assert.equal(await page.getByRole('button', { name: /^Import \d+ entr/ }).count(), 0, 'no import button when nothing is new');
  await btn('Cancel import').click();
  // invalid files
  await choose(JSON.stringify({ app: 'Other', format: 1, entries: [] }));
  await waitText('This is not an export this app can read.');
  await choose('this is { not json');
  await waitText('The file is not valid JSON.');
  await choose(JSON.stringify({ app: 'Private Diary', format: 7, entries: [] }));
  await waitText('different version of the export format');
  // German
  await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
  await waitText('Einstellungen');
  await choose(fileJson, 'Aus Datei importieren');
  await waitText('Nichts Neues zu importieren.');
  await page.getByRole('button', { name: 'Import abbrechen' }).click();
  await page.getByRole('button', { name: 'Gerät', exact: true }).click();
  await waitText('Auto-lock');
  await btn('Back to calendar').click();
  await waitText('2 entries'); // this month: days 1 and 2
  await btn('Search').click();
  await page.getByLabel('Search your diary').fill('importiertes-wort');
  await waitText('1 entry found');
  await page.getByLabel('Search your diary').fill('');
  await waitText('3 entries');
  await btn('Back to calendar').click();
});

await check('O3 on this day: earlier years shown newest first, nothing when none, opens the entry, German, scan passes', async () => {
  const now = new Date();
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  assert.equal(await page.getByText('On this day', { exact: true }).count(), 0, 'nothing before there are older entries');
  const mk = (id, y, text, mood) => ({ id, date: `${y}-${md}`, mood, title: '', text, tags: [], createdAt: `${y}-${md}T08:00:00.000Z`, updatedAt: `${y}-${md}T08:00:00.000Z` });
  const y1 = now.getFullYear() - 1, y2 = now.getFullYear() - 2;
  const json = JSON.stringify({ app: 'Private Diary', format: 1, entries: [mk('oldyear22222222', y2, 'zwei Jahre her', 2), mk('lastyear1111111', y1, 'letztes Jahr heute', 5)] });
  await btn('Settings').click();
  await waitText('Auto-lock');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), btn('Import from a file').click()]);
  await fc.setFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await waitText('Found 2 entries, 2 of them new.');
  await btn('Import 2 entries').click();
  await waitText('Imported 2 entries.');
  await btn('Back to calendar').click();
  await page.getByText('On this day', { exact: true }).waitFor({ timeout: 10000 });
  await expectClean('calendar with throwbacks');
  const body = await text();
  assert.ok(body.indexOf(String(y1)) < body.indexOf(String(y2)) || body.indexOf('letztes Jahr') < body.indexOf('zwei Jahre'), 'newest year first');
  assert.ok(body.includes('letztes Jahr heute') && body.includes('zwei Jahre her'));
  await page.getByRole('button', { name: /Open entry from .*mood Great/ }).click();
  await page.getByLabel('Entry text').waitFor();
  assert.equal(await page.getByLabel('Entry text').inputValue(), 'letztes Jahr heute');
  await btn('Done').click();
  await waitText('writing streak');
  await btn('Settings').click();
  await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
  await page.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await page.getByText('An diesem Tag', { exact: true }).waitFor({ timeout: 10000 });
  await btn('Einstellungen').click();
  await page.getByRole('button', { name: 'Gerät', exact: true }).click();
  await btn('Back to calendar').click();
});

await check('W1-W3 templates: buttons in the editor, fill an empty entry, append to existing text, autosave, German, scan passes', async () => {
  await btn('Write').click();
  await page.getByLabel('Entry text').waitFor();
  await expectClean('editor with templates');
  assert.equal(await page.getByRole('button', { name: /^Insert template / }).count(), 4);
  await btn('Insert template Gratitude').click();
  const v1 = await page.getByLabel('Entry text').inputValue();
  assert.ok(v1.startsWith('Today I am grateful for:'), 'empty entry filled');
  await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
  await btn('Insert template Stoic').click();
  const v2 = await page.getByLabel('Entry text').inputValue();
  assert.ok(v2.startsWith(v1.replace(/\s+$/, '')) && v2.includes('What is in my control today'), 'appended, nothing replaced');
  await page.getByLabel('Entry text').fill(v2 + 'my own line');
  await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
  await btn('Done').click();
  await waitText('writing streak');
  await waitText('Today I am grateful for:'); // preview of today shows the saved text
  await btn('Settings').click();
  await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
  await page.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Vorlage Dankbarkeit einfügen' }).waitFor();
  await page.getByRole('button', { name: 'In den Papierkorb' }).click();
  await waitText('Schreibserie');
  await btn('Einstellungen').click();
  await page.getByRole('button', { name: 'Gerät', exact: true }).click();
  await btn('Back to calendar').click();
});

await check('I3 insights: numbers and charts for the diary, text for every chart, nothing sent over the network, scan passes', async () => {
  const reqs = [];
  const onReq = (r) => { const u = r.url(); if (!u.startsWith(URL) && !u.startsWith('data:') && !u.startsWith('blob:')) reqs.push(u); };
  page.on('request', onReq);
  await btn('Insights').click();
  await page.getByRole('heading', { name: 'Insights' }).waitFor();
  await expectClean('insights');
  const body = await text();
  assert.ok(body.includes('Entries') && body.includes('Words per entry') && body.includes('Longest streak'));
  assert.ok(await page.locator('[aria-label="Entries: 5"]').count() === 1, 'five entries counted (3 + 2 imported)');
  const now = new Date();
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][now.getMonth()];
  assert.equal(await page.locator(`[aria-label*="${mon} ${now.getFullYear()}: "]`).count(), 1, 'month chart has a text version with this month');
  assert.equal(await page.locator('[aria-label^="Week of "]').count(), 1, 'week chart has a text version');
  assert.ok((await page.getByText('Mood by week').count()) === 1 && (await page.getByText('Entries per month').count()) === 1);
  assert.ok((await page.locator('[aria-label^="#importiert"], [aria-label^="importiert"]').count()) >= 1, 'tag row with count');
  assert.deepEqual(reqs, [], 'no network requests');
  page.off('request', onReq);
  await btn('Back to calendar').click();
  await waitText('writing streak');
});

await check('R2 search date presets: 7 days, 30 days, this year and any time change the list and the count; scan passes', async () => {
  const now = new Date();
  const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ym = dk(now).slice(0, 7);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const dates = [`${ym}-01`, `${ym}-02`, `${dk(prev).slice(0, 7)}-15`, `${now.getFullYear() - 1}-${dk(now).slice(5)}`, `${now.getFullYear() - 2}-${dk(now).slice(5)}`];
  const back = (n) => dk(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  const expected = { '7 days': dates.filter((d) => d >= back(6)).length, '30 days': dates.filter((d) => d >= back(29)).length, 'This year': dates.filter((d) => d >= `${now.getFullYear()}-01-01`).length };
  const label = (n) => (n === 1 ? '1 entry found' : `${n} entries found`);
  await btn('Search').click();
  await page.getByLabel('Search your diary').waitFor();
  await waitText('5 entries');
  await expectClean('search with presets');
  for (const [name, n] of Object.entries(expected)) {
    await page.getByRole('button', { name: `Date: ${name}`, exact: true }).click();
    await waitText(label(n), 10000);
  }
  await page.getByRole('button', { name: 'Date: Any time', exact: true }).click();
  await waitText('5 entries');
  assert.equal(await page.locator('[aria-label="Date: Any time"][aria-selected=true]').count(), 1);
  await shot('search-presets');
  await btn('Back to calendar').click();
  await btn('Insights').click();
  await page.getByRole('heading', { name: 'Insights' }).waitFor();
  await shot('insights');
  await btn('Back to calendar').click();
});

await check('K5 markdown preview and backlinks: formatted preview, link button opens the target, Linked from opens the source, German, scan passes', async () => {
  await btn('Write').click();
  await page.getByLabel('Entry text').waitFor();
  await page.getByLabel('Entry title').fill('Target note');
  await page.getByLabel('Entry text').fill('plain target text');
  await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
  await btn('Done').click();
  await waitText('writing streak');
  await page.getByRole('button', { name: /^10 October/ }).click();
  await btn('Write').click();
  await page.getByLabel('Entry text').waitFor();
  await page.getByLabel('Entry title').fill('Source note');
  await page.getByLabel('Entry text').fill('# Big heading\n\nsome **bold words** and a link to [[Target note]] and [[Missing one]]');
  await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Back to editing', exact: true }).waitFor();
  await expectClean('editor preview');
  const body = await text();
  assert.ok(body.includes('Big heading') && body.includes('bold words') && !body.includes('**') && !body.includes('# Big'), 'markdown marks are rendered, not shown');
  await page.getByText('Links in this entry').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Open Target note', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: /Open Missing one/ }).count(), 0, 'unknown target has no button');
  await shot('preview');
  await page.getByRole('button', { name: 'Open Target note', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Entry title"]')?.value === 'Target note', null, { timeout: 10000 });
  await page.getByText('Linked from').waitFor();
  await page.getByRole('button', { name: /^Open entry linking here from/ }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Entry title"]')?.value === 'Source note', null, { timeout: 10000 });
  await btn('Done').click();
  await waitText('writing streak');
  await btn('Settings').click();
  await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
  await page.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await page.getByRole('button', { name: /^10\.? Oktober/ }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Vorschau', exact: true }).click();
  await page.getByText('Links in diesem Eintrag').waitFor();
  const de = await text();
  assert.ok(!/Links in this entry|Back to editing/.test(de), 'no English left in preview');
  await page.getByRole('button', { name: 'Zurück zum Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'In den Papierkorb' }).click();
  await waitText('Schreibserie');
  await page.getByRole('button', { name: /^11\.? Oktober/ }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'In den Papierkorb' }).click();
  await waitText('Schreibserie');
  await btn('Einstellungen').click();
  await page.getByRole('button', { name: 'Gerät', exact: true }).click();
  await btn('Back to calendar').click();
});

await check('Y5 import from Daylio CSV and Day One JSON: preview, confirm, found by search, repeat adds nothing, German, scan passes', async () => {
  const csv = ['full_date,date,weekday,time,mood,activities,note_title,note', '2019-03-05,March 5,Tuesday,9:41 PM,good,work | gym,Lange Tag,"Zeile eins, mit Komma', 'Zeile zwei"', '2019-03-05,March 5,Tuesday,8:00 AM,rad,coffee,,Morgennotiz', '2019-03-06,March 6,Wednesday,21:10,awful,,,daylio-sechster'].join('\n');
  const one = JSON.stringify({ metadata: { version: '1.0' }, entries: [
    { uuid: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', creationDate: '2018-05-17T12:30:00Z', timeZone: 'Europe/Berlin', text: '# Berliner Titel\n\ndayone-wort 1\\. Teil', tags: ['reise'] },
    { uuid: 'B1B2C3D4E5F60718293A4B5C6D7E8F91', creationDate: '2018-06-02T10:00:00Z', text: '' },
  ] });
  const choose = async (name, mime, content) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), btn('Import from a file').click()]);
    await fc.setFiles({ name, mimeType: mime, buffer: Buffer.from(content) });
  };
  await btn('Settings').click();
  await waitText('Auto-lock');
  await choose('daylio.csv', 'text/csv', csv);
  await waitText('Found 2 entries, 2 of them new.');
  await expectClean('daylio preview');
  await btn('Import 2 entries').click();
  await waitText('Imported 2 entries.');
  await choose('daylio.csv', 'text/csv', csv);
  await waitText('Nothing new to import.');
  await btn('Cancel import').click();
  await choose('dayone.json', 'application/json', one);
  await waitText('Found 1 entry, 1 of them new.');
  await waitText('Entries that could not be read and will be skipped: 1.');
  await btn('Import 1 entry').click();
  await waitText('Imported 1 entry.');
  await choose('bad.csv', 'text/csv', 'full_date,foo\n1,2');
  await waitText('This CSV file is not a Daylio export.');
  await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
  await waitText('Hole Einträge aus einem JSON-Export dieser App, einer Daylio-CSV');
  await page.getByRole('button', { name: 'Gerät', exact: true }).click();
  await btn('Back to calendar').click();
  await btn('Search').click();
  await page.getByLabel('Search your diary').fill('Zeile zwei');
  await waitText('1 entry found');
  await page.getByLabel('Search your diary').fill('dayone-wort');
  await waitText('1 entry found');
  assert.ok((await text()).includes('Berliner Titel'));
  await page.getByLabel('Search your diary').fill('Morgennotiz');
  await waitText('1 entry found');
  await page.getByRole('button', { name: /mood Great/ }).first().waitFor();
  await btn('Back to calendar').click();
  await waitText('writing streak');
});

await check('P6-P7 / L2 photos and location: add, thumbnail decodes, reopen, enlarge, limit, remove, denied permission, encrypted at rest, no network, German, scan passes', async () => {
  const { deflateSync } = await import('node:zlib');
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(16, 0); ihdr.writeUInt32BE(16, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 16 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(48, 200)])));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('Comment\0PHOTO-MARKER-QWX')), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const reqs = [];
  const onReq = (r) => { const u = r.url(); if (!u.startsWith(URL) && !u.startsWith('data:') && !u.startsWith('blob:')) reqs.push(u); };
  page.on('request', onReq);
  const addPhoto = async () => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add photo', exact: true }).click()]);
    await fc.setFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });
  };
  const thumbsOk = async (n) => {
    await page.waitForFunction((k) => { const imgs = [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0); return imgs.length >= k; }, n, { timeout: 15000 });
  };
  await btn('Write').click();
  await page.getByLabel('Entry text').waitFor();
  await page.getByLabel('Entry title').fill('Photo day');
  await page.getByLabel('Entry text').fill('with a picture');
  await addPhoto();
  await thumbsOk(1);
  await page.getByRole('button', { name: 'Photo 1, tap to enlarge' }).waitFor();
  await page.getByRole('button', { name: 'Add location', exact: true }).click();
  await page.getByRole('button', { name: 'Remove location 40.713° N, 74.006° W' }).waitFor({ timeout: 10000 });
  await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
  await expectClean('editor with photo and location');
  await shot('photo-editor');
  await btn('Done').click();
  await waitText('writing streak');
  // reopen: both are still there
  await btn('Edit').click();
  await page.getByLabel('Entry text').waitFor();
  await thumbsOk(1);
  await page.getByRole('button', { name: 'Remove location 40.713° N, 74.006° W' }).waitFor();
  await page.getByRole('button', { name: 'Photo 1, tap to enlarge' }).click();
  await page.getByRole('img', { name: 'Enlarged photo' }).waitFor();
  await page.getByRole('button', { name: 'Close photo' }).click();
  // at rest: no readable picture, marker or coordinates in the stored database
  const rest = await page.evaluate(() => new Promise((resolve, reject) => {
    const q = indexedDB.open('private-diary', 1);
    q.onerror = () => reject(q.error);
    q.onsuccess = () => {
      const g = q.result.transaction('kv').objectStore('kv').get('db:diary.sqlite');
      g.onsuccess = () => {
        const u = g.result; let bin = '';
        for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        resolve({ size: bin.length, png: bin.includes('\x89PNG'), marker: bin.includes('PHOTO-MARKER-QWX'), word: bin.includes('with a picture'), coord: bin.includes('40.713') });
      };
    };
  }));
  assert.ok(rest.size > 1000);
  assert.deepEqual([rest.png, rest.marker, rest.word, rest.coord], [false, false, false, false], 'database holds no readable photo, text or coordinates');
  // limit: ten photos, then the button is gone; removing one brings it back
  for (let i = 0; i < 9; i++) await addPhoto();
  await page.getByRole('button', { name: 'Photo 10, tap to enlarge' }).waitFor({ timeout: 20000 });
  assert.equal(await page.getByRole('button', { name: 'Add photo', exact: true }).count(), 0, 'no more than ten photos');
  await thumbsOk(10);
  await page.getByRole('button', { name: 'Remove photo 10' }).click();
  await page.getByRole('button', { name: 'Add photo', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Photo \d+, tap to enlarge/ }).count(), 9);
  // a file that is not a picture is refused
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add photo', exact: true }).click()]);
  await fc.setFiles({ name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('this is not a picture') });
  await waitText('That file is not a picture.');
  assert.equal(await page.getByRole('button', { name: /^Photo \d+, tap to enlarge/ }).count(), 9);
  // location: remove, denied, allowed again
  await page.getByRole('button', { name: 'Remove location 40.713° N, 74.006° W' }).click();
  await ctx.clearPermissions();
  await page.getByRole('button', { name: 'Add location', exact: true }).click();
  await waitText('Location is not allowed.');
  assert.equal(await page.getByRole('button', { name: /^Remove location/ }).count(), 0, 'nothing changed');
  await ctx.grantPermissions(['geolocation']);
  await page.getByRole('button', { name: 'Add location', exact: true }).click();
  await page.getByRole('button', { name: 'Remove location 40.713° N, 74.006° W' }).waitFor({ timeout: 10000 });
  await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
  assert.deepEqual(reqs, [], 'no network requests');
  page.off('request', onReq);
  // German
  await btn('Done').click();
  await waitText('writing streak');
  await btn('Settings').click();
  await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
  await waitText('Fotos und Orte bleiben in der App');
  await page.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Foto 1, zum Vergrößern tippen' }).waitFor();
  await page.getByRole('button', { name: 'Foto 9 entfernen' }).waitFor();
  await page.getByRole('button', { name: 'Ort 40.713° N, 74.006° W entfernen' }).waitFor();
  await page.getByRole('button', { name: 'Foto hinzufügen', exact: true }).waitFor();
  await page.getByRole('button', { name: 'In den Papierkorb' }).click();
  await waitText('Schreibserie');
  await btn('Einstellungen').click();
  await page.getByRole('button', { name: 'Gerät', exact: true }).click();
  await btn('Back to calendar').click();
});

await check('M2 several entries on one day: newest shown, others listed and opened, Add another entry, no state leaking, German, scan passes', async () => {
  const write = async (title, body) => {
    await page.getByLabel('Entry text').waitFor();
    assert.equal(await page.getByLabel('Entry title').inputValue(), '', 'a new entry starts empty');
    await page.getByLabel('Entry title').fill(title);
    await page.getByLabel('Entry text').fill(body);
    await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
    await btn('Done').click();
    await waitText('writing streak');
  };
  await btn('Write').click();
  await write('Erster', 'eins');
  assert.equal(await page.getByRole('button', { name: 'Add another entry', exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Add another entry', exact: true }).click();
  await write('Zweiter', 'zwei');
  await page.getByText('More entries on this day').waitFor();
  assert.ok((await text()).includes('Zweiter'), 'newest is the preview');
  await page.getByRole('button', { name: 'Open another entry: Erster', exact: true }).click();
  await page.getByLabel('Entry text').waitFor();
  assert.equal(await page.getByLabel('Entry title').inputValue(), 'Erster');
  assert.equal(await page.getByLabel('Entry text').inputValue(), 'eins');
  await btn('Done').click();
  await waitText('writing streak');
  await page.getByRole('button', { name: 'Add another entry', exact: true }).click();
  await write('Dritter', 'drei');
  assert.equal(await page.getByRole('button', { name: /^Open another entry: / }).count(), 2);
  await btn('Edit').click();
  await page.getByLabel('Entry text').waitFor();
  assert.equal(await page.getByLabel('Entry title').inputValue(), 'Dritter', 'Edit opens the shown (newest) entry');
  await btn('Done').click();
  await waitText('writing streak');
  await btn('Settings').click();
  await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
  await page.getByRole('button', { name: 'Zurück zum Kalender' }).click();
  await page.getByText('Weitere Einträge an diesem Tag').waitFor();
  await page.getByRole('button', { name: 'Weiteren Eintrag hinzufügen', exact: true }).waitFor();
  await expectClean('calendar with several entries');
  await btn('Einstellungen').click();
  await page.getByRole('button', { name: 'Gerät', exact: true }).click();
  await btn('Back to calendar').click();
});

await check('no script errors during the whole run', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length} of ${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
