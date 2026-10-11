// Takes the screenshots for the user manual from the real screens, with sample data. Run after build:web and with dist-web on port 8099.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const URL = 'http://localhost:8099/';
const OUT = '/tmp/claude-0/manual';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: { latitude: 38.72252, longitude: -9.13934 }, permissions: ['geolocation'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 300)));
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const btn = (name, exact = false) => page.getByRole('button', { name, exact }).first();
const waitText = (t, timeout = 30000) => page.getByText(t, { exact: false }).first().waitFor({ timeout });
const pin = async (digits) => { for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click(); };
const PASS = '482915';

const now = new Date();
const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ago = (n) => dk(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
const lastYear = `${now.getFullYear() - 1}-${dk(now).slice(5)}`;
const E = (i, date, mood, title, text, tags) => ({ id: `sample${String(i).padStart(3, '0')}aaaa`, date, mood, title, text, tags, createdAt: `${date}T19:00:00.000Z`, updatedAt: `${date}T19:00:00.000Z` });
const entries = [
  E(1, ago(27), 3, 'New notebook', 'Bought a notebook today and decided to try keeping a diary again. Short entries are fine.', ['start']),
  E(2, ago(24), 4, 'Dinner with Mia', 'Cooked pasta for Mia and talked for hours. I forgot to look at my phone.', ['family', 'gratitude']),
  E(3, ago(21), 2, 'Slow Monday', 'Too many meetings and not enough sleep. Tomorrow I will go to bed earlier.', ['work']),
  E(4, ago(18), 4, 'Morning walk', 'Walked along the river before work. The air was cold and clear, and I felt calm for the first time this week.', ['walk', 'gratitude']),
  E(5, ago(15), 5, 'Finished the book', 'Finished the novel I started in August. The ending was better than I expected.', ['reading']),
  E(6, ago(12), 3, 'Ordinary day', 'Nothing special. Laundry, emails, a short run.', ['routine']),
  E(7, ago(9), 4, 'Team lunch', 'Lunch with the new team. They are friendlier than I feared.', ['work']),
  E(8, ago(6), 1, 'Rough night', 'Could not sleep. Too many thoughts about the move. Writing them down helps a little.', ['sleep']),
  E(9, ago(4), 4, 'Weekend plans', 'Plan for Saturday: repeat the [[Morning walk]], then visit Mum. Bring the book for her.', ['family', 'plans']),
  E(10, ago(2), 5, 'Visit to Mum', 'Mum loved the book. We had tea and looked at old photos.', ['family', 'gratitude']),
  E(11, ago(1), 3, 'Quiet evening', 'Tidied the desk and wrote a few cards.', ['routine']),
  E(12, lastYear, 4, 'A year ago', 'Rain all day, but a good conversation with an old friend.', ['friends']),
];
const sample = JSON.stringify({ app: 'Private Diary', format: 1, entries });

await page.goto(URL);
await waitText('Create your passcode');
await shot('01-create-passcode');
await btn('Use a passphrase instead').click();
await page.waitForTimeout(300);
await shot('02-passphrase-option');
await btn('Use a 6-digit').click().catch(async () => { await page.getByText(/6.digit/i).first().click(); });
await page.waitForTimeout(300);
await pin(PASS);
await waitText('Repeat your passcode');
await pin(PASS);
await waitText('Write down your recovery key', 60000);
await shot('03-recovery-key');
await btn('I have written it down').click();
await waitText('writing streak', 30000);
await shot('04-calendar-empty');

// sample data through the real import screen
await btn('Settings', true).click();
await waitText('Auto-lock');
await shot('20-settings');
const [fc] = await Promise.all([page.waitForEvent('filechooser'), btn('Import from a file').click()]);
await fc.setFiles({ name: 'sample-diary.json', mimeType: 'application/json', buffer: Buffer.from(sample) });
await waitText('Found 12 entries');
await shot('21-import-preview');
await btn('Import 12 entries').click();
await waitText('Imported 12 entries.');
await btn('Back to calendar').click();
await waitText('writing streak');
await shot('05-calendar');

// a day with an entry selected
await page.getByRole('button', { name: new RegExp(`^${now.getDate() - 4} `) }).first().click().catch(() => {});
await page.waitForTimeout(300);
await shot('06-calendar-day');
await page.mouse.move(200, 500);
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(300);
await shot('07-on-this-day');

// writing today: template, tags, mood, photo, location
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) el.scrollTop = 0; });
await page.getByRole('button', { name: new RegExp(`^${now.getDate()} .*today`) }).first().click().catch(() => {});
await btn('Write', true).click();
await page.getByLabel('Entry text').waitFor({ timeout: 8000 }).catch(async (e) => { await shot('FAIL'); console.log((await page.innerText('body')).slice(0, 400)); throw e; });
await shot('08-editor-empty');
await btn('Insert template Gratitude').click();
await page.waitForTimeout(300);
await shot('09-template');
await page.getByLabel('Entry title').fill('A good Sunday');
await page.getByLabel('Entry text').fill('Today I am grateful for:\n1. Coffee on the balcony\n2. A long call with Mia\n3. The sunset on the way home\n\nI also want to repeat the [[Morning walk]] next week. **Remember to sleep early.**');
await page.getByLabel('Add a tag').fill('gratitude,');
await page.getByLabel('Add a tag').fill('weekend');
await page.getByLabel('Add a tag').press('Enter');
await page.getByLabel('Mood: Great').click();
await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) el.scrollTop = 0; });
await page.waitForTimeout(300);
await shot('10-editor-filled');
const [fp] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Add photo', exact: true }).click()]);
await fp.setFiles({ name: 'sunset.jpg', mimeType: 'image/jpeg', buffer: readFileSync(`${OUT}/sunset.jpg`) });
await page.waitForFunction(() => [...document.querySelectorAll('img')].some((i) => i.naturalWidth > 0), null, { timeout: 15000 });
await page.getByRole('button', { name: 'Add location', exact: true }).click();
await page.getByRole('button', { name: /^Remove location/ }).waitFor({ timeout: 10000 });
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.scrollHeight > el.clientHeight + 20 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = 400; });
await page.waitForTimeout(400);
await shot('11-photo-location');
await page.getByRole('button', { name: 'Photo 1, tap to enlarge' }).click();
await page.waitForTimeout(500);
await shot('12-photo-enlarged');
await page.getByRole('button', { name: 'Close photo' }).click();
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) el.scrollTop = 0; });
await btn('Preview', true).click();
await page.waitForTimeout(400);
await shot('13-preview');
await btn('Back to editing', true).click();
await page.getByText('Saved and encrypted').waitFor();
await btn('Done', true).click();
await waitText('writing streak');
await page.waitForTimeout(300);
await shot('14-calendar-after');

await btn('Search', true).click();
await page.getByLabel('Search your diary').fill('walk');
await page.waitForTimeout(300);
await shot('15-search');
await page.getByLabel('Search your diary').fill('');
await page.getByRole('button', { name: 'Date: 30 days', exact: true }).click();
await page.getByRole('button', { name: /^Filter tag: family/ }).click();
await page.waitForTimeout(300);
await shot('16-search-filters');
await btn('Back to calendar').click();
await btn('Insights', true).click();
await page.getByRole('heading', { name: 'Insights' }).waitFor();
await page.waitForTimeout(400);
await shot('17-insights');
await btn('Back to calendar').click();

await page.getByRole('button', { name: new RegExp(`^${now.getDate() - 3} `) }).first().click();
await btn('Write', true).click();
await page.getByLabel('Entry title').fill('Draft I do not need');
await page.getByLabel('Entry text').fill('A half-finished thought that I decided to throw away.');
await page.getByText('Saved and encrypted').waitFor({ timeout: 10000 });
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) el.scrollTop = 0; });
await btn('Move to trash', true).click();
await waitText('writing streak');
await btn('Open trash', true).click();
await page.waitForTimeout(400);
await shot('18-trash-empty');
await btn('Back to calendar').click().catch(() => {});

await btn('Settings', true).click();
await waitText('Auto-lock');
await page.evaluate(() => { for (const el of document.querySelectorAll('*')) if (el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = 600; });
await page.waitForTimeout(300);
await shot('22-settings-more');
await btn('Export as PDF', true).click();
await page.waitForTimeout(300);
await shot('23-export');
await btn('Cancel export').click();
await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
await page.waitForTimeout(400);
await shot('24-german-settings');
await page.getByRole('button', { name: 'Zurück zum Kalender' }).click();
await page.waitForTimeout(400);
await shot('25-german-calendar');
await btn('Einstellungen', true).click();
await page.getByRole('button', { name: 'Gerät', exact: true }).click();
await btn('Back to calendar').click();
await waitText('writing streak');
await btn('Lock diary now', true).click();
await waitText('Diary is locked');
await shot('19-unlock');
await browser.close();
console.log('done');
