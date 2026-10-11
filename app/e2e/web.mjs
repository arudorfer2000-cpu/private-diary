// Browser checks that are specific to the installable web app (storage, photos, offline, install files, network).
// Run after `npm run build:web` with the build served at APP_URL (default http://localhost:8099/).
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const URL = process.env.APP_URL ?? 'http://localhost:8099/';
const IMG = process.env.WEB_IMAGES ?? '/tmp/claude-0/webimgs';
const results = [];
let page;
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { await page.screenshot({ path: `/tmp/claude-0/shots/WEBFAIL-${results.length}.png` }).catch(() => {}); results.push(['FAIL', name]); console.log('FAIL', name, '-', String(e.message).split('\n')[0]); }
};
fs.mkdirSync('/tmp/claude-0/shots', { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'allow' });
page = await ctx.newPage();
const origin = new globalThis.URL(URL).origin;
const foreign = [];
const requested = [];
ctx.on('request', (r) => { requested.push(r.url()); if (!r.url().startsWith(origin) && !r.url().startsWith('data:') && !r.url().startsWith('blob:') && !r.url().startsWith('about:')) foreign.push(r.url()); });
await ctx.addInitScript(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  // test clock: lets the test "wait" minutes without waiting
  window.__skew = 0;
  const real = Date.now.bind(Date);
  Date.now = () => real() + window.__skew;
});

const text = () => page.innerText('body');
const waitText = (t, timeout = 30000) => page.getByText(t, { exact: false }).first().waitFor({ timeout });
const pin = async (d) => { for (const c of d) await page.getByRole('button', { name: c, exact: true }).click(); };
const btn = (name) => page.getByRole('button', { name, exact: false }).first();
const PASS = '482915';
const unlock = async () => { await waitText('Diary is locked'); await pin(PASS); await waitText('writing streak', 60000); };
const idbSize = () => page.evaluate(() => new Promise((res, rej) => {
  const q = indexedDB.open('private-diary', 1);
  q.onerror = () => rej(q.error);
  q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('db:diary.sqlite'); g.onsuccess = () => res(g.result ? g.result.length : 0); };
}));
const attach = async (file) => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add photo', exact: true }).click()]);
  await fc.setFiles(file);
};
const decoded = (n) => page.waitForFunction((k) => [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length >= k, n, { timeout: 30000 });

await page.goto(URL);
await check('W3.1 install files: manifest is valid, every icon loads, Apple icon and tags present', async () => {
  const m = await (await ctx.request.get(URL + 'manifest.webmanifest')).json();
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name && m.start_url && m.background_color && m.theme_color);
  const sizes = new Set();
  for (const i of m.icons) {
    const r = await ctx.request.get(new globalThis.URL(i.src, URL + 'manifest.webmanifest').href);
    assert.equal(r.status(), 200, i.src);
    assert.match(r.headers()['content-type'], /image\/png/);
    sizes.add(i.sizes + (i.purpose ?? ''));
  }
  assert.ok(sizes.has('192x192') && sizes.has('512x512') && sizes.has('512x512maskable'));
  assert.equal((await ctx.request.get(URL + 'apple-touch-icon.png')).status(), 200);
  const tags = await page.evaluate(() => ({
    manifest: !!document.querySelector('link[rel=manifest]'), apple: !!document.querySelector('link[rel=apple-touch-icon]'),
    cap: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content, csp: document.querySelector('meta[http-equiv=Content-Security-Policy]')?.content,
  }));
  assert.ok(tags.manifest && tags.apple && tags.cap === 'yes' && /default-src 'none'/.test(tags.csp));
});

await check('setup and first entry', async () => {
  await waitText('Create your passcode');
  await pin(PASS); await waitText('Repeat your passcode'); await pin(PASS);
  await waitText('Write down your recovery key', 60000);
  await btn('I have written it down').click();
  await waitText('writing streak', 30000);
});

await check('W1.4 text typed just before a reload is kept (a save is reported only when it is stored)', async () => {
  await btn('Write').click();
  await page.getByLabel('Entry title').fill('Reload test');
  await page.getByLabel('Entry text').fill('typed right before the page was reloaded');
  await waitText('Saved and encrypted', 8000);
  await page.reload();
  await unlock();
  await waitText('Reload test');
  await waitText('typed right before the page was reloaded');
});

await check('W1.1 entries, settings and key bundle survive reloads; localStorage stays empty; keys live in IndexedDB', async () => {
  assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0);
  const keys = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open('private-diary', 1); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').getAllKeys(); g.onsuccess = () => res(g.result); }; }));
  assert.ok(keys.includes('db:diary.sqlite') && keys.some((k) => k.startsWith('key:')), JSON.stringify(keys));
  const p2 = await ctx.newPage();
  await p2.goto(URL);
  await p2.getByText('Diary is locked').first().waitFor({ timeout: 30000 });
  await p2.close();
});

await check('W2.2 a 12-megapixel photo is stored as a JPEG of at most 1600 px', async () => {
  await btn('Edit').click();
  await page.getByLabel('Entry text').waitFor();
  await attach(`${IMG}/big12mp.jpg`);
  await decoded(1);
  const dims = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0);
    return imgs.map((i) => [i.naturalWidth, i.naturalHeight, i.src.slice(0, 22)]);
  });
  assert.ok(dims.length >= 1);
  const [w, h, src] = dims[0];
  assert.ok(src.startsWith('data:image/jpeg'), src);
  assert.ok(Math.max(w, h) <= 1600 && Math.max(w, h) >= 1500, `${w}x${h}`);
  await btn('Remove photo 1').click();
  await btn('Done').click();
  await waitText('writing streak');
});

await check('W1.2 / W1.3 twelve large photos (over 5 MB in total) are stored, reload and are not readable at rest', async () => {
  for (const [title, from] of [['Photos A', 0], ['Photos B', 6]]) {
    await btn('Add another entry').click();
    await page.getByLabel('Entry text').waitFor();
    await page.getByLabel('Entry title').fill(title);
    await page.getByLabel('Entry text').fill('many pictures ' + title);
    for (let i = 0; i < 6; i++) { await attach(`${IMG}/noise${from + i}.jpg`); await decoded(i + 1); }
    await btn('Done').click();
    await waitText('writing streak');
    if (title === 'Photos A') { await page.getByRole('button', { name: /^(Next month|Previous month)$/ }).first().isVisible().catch(() => {}); }
  }
  const size = await idbSize();
  assert.ok(size > 5 * 1024 * 1024, `database only ${size} bytes`);
  await page.reload();
  await unlock();
  await waitText('many pictures');
  await btn('Edit').click();
  await decoded(6);
  const rest = await page.evaluate(() => new Promise((res) => {
    const q = indexedDB.open('private-diary', 1);
    q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('db:diary.sqlite'); g.onsuccess = () => {
      const u = g.result; let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      res({ jpeg: bin.includes('\xff\xd8\xff'), text: bin.includes('many pictures'), title: bin.includes('Reload test') });
    }; };
  }));
  assert.deepEqual(rest, { jpeg: false, text: false, title: false });
  await btn('Done').click();
  await waitText('writing streak');
});

await check('W2.1 Settings on the web: no reminder switch, no Face ID, explanations shown', async () => {
  await btn('Settings').click();
  await waitText('Your data');
  const t = await text();
  assert.ok(t.includes('The web version cannot send reminders'), 'reminder note');
  assert.ok(t.includes('About this web version') && t.includes('protected only by your passcode'));
  assert.ok(!/Face ID/i.test(t), 'no Face ID on the web');
  assert.equal(await page.getByRole('switch', { name: 'Daily reminder' }).count(), 0);
  await btn('Back to calendar').click();
  await waitText('writing streak');
});

await check('W2.4 the diary locks when the tab was hidden for longer than the auto-lock time', async () => {
  const hide = (v) => page.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }, v);
  await hide('hidden');
  await page.evaluate(() => { window.__skew += 70 * 60 * 1000; });
  await hide('visible');
  await waitText('Diary is locked', 15000);
  await pin(PASS);
  await waitText('writing streak', 60000);
});

await check('W3.2 after the first visit the app opens and works with no network at all', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); // now controlled by the worker
  await unlock();
  const names = await page.evaluate(() => caches.keys());
  assert.ok(names.some((n) => /^private-diary-[0-9a-f]{12}$/.test(n)), JSON.stringify(names));
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled by the worker');
  await ctx.setOffline(true);
  await page.reload();
  await unlock();
  await waitText('Reload test');
  await btn('Add another entry').click();
  await page.getByLabel('Entry text').fill('written in airplane mode');
  await waitText('Saved and encrypted', 8000);
  await btn('Done').click();
  await waitText('writing streak');
  await ctx.setOffline(false);
});

await check('W3.3 no request left this site, and the security policy blocked nothing', async () => {
  assert.deepEqual(foreign, []);
  const csp = await page.evaluate(() => window.__csp);
  assert.deepEqual(csp, []);
  const policy = await page.evaluate(() => document.querySelector('meta[http-equiv=Content-Security-Policy]').content);
  // the policy really forbids other sites: try to load one
  const blocked = await page.evaluate(() => new Promise((res) => {
    const i = new Image(); i.onload = () => res(false); i.onerror = () => res(true); i.src = 'https://example.invalid/x.png';
    setTimeout(() => res(true), 3000);
  }));
  assert.ok(blocked && /img-src 'self' data: blob:/.test(policy));
  const violated = await page.evaluate(() => window.__csp.length);
  assert.ok(violated >= 1, 'the probe was blocked by the policy');
});

await browser.close();
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`${results.length - failed.length} of ${results.length} web checks passed`);
process.exit(failed.length ? 1 : 0);
