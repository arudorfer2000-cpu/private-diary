// Viewer checks TC-V1..V9, V12, V13 in headless Chromium. Usage: node viewer_test.mjs <dir with viewer.html, viewer-old.html, expected.json>
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire('/home/user/private-diary/app/package.json');
const { chromium } = require('playwright');
const dir = process.argv[2];
const exp = JSON.parse(fs.readFileSync(dir + '/expected.json'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { const fixed = new Date('2026-10-24T12:00:00Z').getTime(); Date.now = () => fixed; });
const page = await ctx.newPage();
const external = [];
page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) external.push(r.url()); });
await page.goto('file://' + dir + '/viewer.html');
const count = async () => parseInt((await page.textContent('#count')).split(' ')[0]);
const total = async () => parseInt((await page.textContent('#count')).split(' of ')[1]);
const clear = async () => { await page.click('#clear'); };
const setSel = async (id, v) => { await page.selectOption('#' + id, v); };
const setIn = async (id, v) => { await page.fill('#' + id, v); };
const seg = async r => { await page.click(`.seg button[data-region="${r}"]`); };

ok(await count() === exp.total, 'V1 initial count ' + await count());
ok(external.length === 0, 'V1 external requests: ' + external.join(','));
// V12: UK / EU / both switch
await seg('UK'); ok(await count() === exp.UK, 'V12 UK ' + await count() + ' vs ' + exp.UK);
await seg('EU'); ok(await count() === exp.EU, 'V12 EU ' + await count() + ' vs ' + exp.EU);
await seg('both'); ok(await count() === exp.total, 'V12 both');
ok((await page.getAttribute('.seg button[data-region="both"]', 'aria-checked')) === 'true', 'V12 aria-checked');
// V2 single filters
const cases = [
  ['topic:economics', () => setSel('topic', 'economics')], ['country:AT', () => setSel('country', 'AT')],
  ['language:English', () => setSel('language', 'English')], ['level:phd', () => setSel('level', 'phd')],
  ['stipend:full funding', () => setSel('stipend', 'full funding')], ['elig:eligible', () => setSel('elig', 'eligible')],
  ['year:2027', () => setSel('year', '2027')], ['status:closed', () => setSel('status', 'closed')],
  ['mark:applied', () => setSel('mark', 'applied')], ['hasContact', () => page.check('#hasContact')],
  ['deadline:2026-11-01..2026-12-31', async () => { await setIn('dlFrom', '2026-11-01'); await setIn('dlTo', '2026-12-31'); }],
  ['firstseen>=2026-10-23', () => setIn('fsFrom', '2026-10-23')],
  ['search:alpha', () => setIn('q', 'alpha')], ['search:quote for opportunity 7', () => setIn('q', 'quote for opportunity 7')],
];
for (const [k, f] of cases) { await clear(); await f(); const n = await count(); ok(n === exp[k], `V2 ${k}: ${n} vs ${exp[k]}`); }
// V3 combined, then clear
await clear(); await seg('EU'); await setSel('topic', 'art history'); await setSel('elig', 'unclear');
ok(await count() === exp['EU+topic:art history+elig:unclear'], 'V3 combined ' + await count());
await clear(); ok(await count() === exp.total, 'V3 clear restores');
await seg('EU'); await setSel('country', 'ES'); ok(await count() === exp['EU+country:ES'], 'V13 EU+ES'); await clear();
// V5 sort
await setSel('sort', 'name'); await setSel('dir', 'desc');
const names = await page.$$eval('.card h2', e => e.map(x => x.textContent));
ok(JSON.stringify(names) === JSON.stringify([...names].sort().reverse()), 'V5 name desc');
await setSel('sort', 'deadline'); await setSel('dir', 'asc');
const dl = await page.$$eval('.card .sub', e => e.map(x => (x.textContent.match(/Deadline: (\d{4}-\d\d-\d\d)/) || [])[1] || '9999'));
ok(JSON.stringify(dl) === JSON.stringify([...dl].sort()), 'V5 deadline asc');
// V6 details, V7 markers (text, not colour only)
await clear();
await page.click('.card summary');
const detail = await page.textContent('.card[open] .detail');
ok(/Source/.test(detail) && /Last checked/.test(detail) && /Contact/.test(detail), 'V6 detail fields');
const soon = await page.$$eval('.badge', e => e.filter(b => /Closing soon/.test(b.textContent)).length);
ok(soon === exp.closingsoon, 'V7 closing soon badges ' + soon + ' vs ' + exp.closingsoon);
ok(await page.$$eval('.badge', e => e.some(b => b.textContent === 'NEW')), 'V7 NEW badge');
// V8 phone width, no horizontal scroll, controls >= 44px and named
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'V8 no horizontal scroll');
const small = await page.$$eval('button, select, input:not([type=checkbox]), summary', els => els.filter(e => e.getBoundingClientRect().height < 43).map(e => e.id || e.textContent.slice(0, 20)));
ok(small.length === 0, 'V8 small controls: ' + small.join(','));
const unnamed = await page.$$eval('button, select, input, summary', els => els.filter(e => !(e.labels && e.labels.length) && !e.textContent.trim() && !e.getAttribute('aria-label')).map(e => e.id));
ok(unnamed.length === 0, 'V8 unnamed: ' + unnamed.join(','));
ok(await page.$eval('h1', e => !!e.textContent), 'V8 heading');
await page.emulateMedia({ colorScheme: 'dark' });
ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(20, 23, 31)', 'V8 dark mode');
// V9 stale warning
ok(await page.$eval('#stale', e => e.hidden), 'V9 fresh export has no warning');
const old = await ctx.newPage(); await old.goto('file://' + dir + '/viewer-old.html');
// export date 2026-10-01 vs real clock: always older than 14 days from now
ok(await old.$eval('#stale', e => !e.hidden && /days old/.test(e.textContent)), 'V9 stale warning shown');
// V11 no secrets in page source
const src = fs.readFileSync(dir + '/viewer.html', 'utf8');
ok(!/SECRET_PW|sk-ant|ANTHROPIC|smtp/i.test(src), 'V11 no secrets');
await browser.close();
console.log(`viewer checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
