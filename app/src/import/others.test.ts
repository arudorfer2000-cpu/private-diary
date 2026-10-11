import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnyImport, parseCsv, parseDayOne, parseDaylio } from './others';

const DAYLIO = [
  'full_date,date,weekday,time,mood,activities,note_title,note',
  '2024-03-05,March 5,Tuesday,9:41 PM,good,work | gym,Long day,"Line one, with comma',
  'Line two with ""quotes"" and ümlaut 🏔"',
  '2024-03-05,March 5,Tuesday,8:00 AM,rad,coffee,,Morning note',
  '2024-03-06,March 6,Tuesday,21:10,awful,,,',
  '2024-13-40,bad,date,1:00,good,,,x',
  '2024-03-07,March 7,Thursday,7:00,unknownmood,,,Fine',
].join('\r\n');

test('Y1 Daylio CSV: quoting, moods, activities as tags, same-day rows merged, bad rows counted', () => {
  assert.deepEqual(parseCsv('a,"b,c","d""e"\n1,2,3\n'), [['a', 'b,c', 'd"e'], ['1', '2', '3']]);
  assert.equal(parseCsv('a,"open'), null);
  const r = parseDaylio(DAYLIO);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.invalid, 1);
  assert.deepEqual(r.items.map((i) => i.day), ['2024-03-05', '2024-03-06', '2024-03-07']);
  const d5 = r.items[0];
  assert.equal(d5.id, 'daylio-2024-03-05');
  assert.equal(d5.entry.mood, 5, 'rad (5) and good (4) average 4.5 and round up');
  assert.equal(d5.entry.title, 'Long day');
  assert.deepEqual(d5.entry.tags, ['work', 'gym', 'coffee']);
  assert.ok(d5.entry.text.startsWith('Morning note'), 'earlier time first');
  assert.ok(d5.entry.text.includes('Line one, with comma\nLine two with "quotes" and ümlaut 🏔'));
  assert.equal(r.items[1].entry.mood, 1);
  assert.equal(r.items[2].entry.mood, 3, 'unknown mood name becomes okay');
});

const DAYONE = JSON.stringify({
  metadata: { version: '1.0' },
  entries: [
    { uuid: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', creationDate: '2020-05-17T22:30:00Z', timeZone: 'America/New_York', text: '# My title\n\nFirst 1\\. thing \\- done', tags: ['Travel', 'x'] , modifiedDate: '2020-05-18T01:00:00Z'},
    { uuid: 'B1B2C3D4E5F60718293A4B5C6D7E8F91', creationDate: '2021-01-02T10:00:00Z', text: 'No title here' },
    { uuid: 'C1B2C3D4E5F60718293A4B5C6D7E8F92', creationDate: '2021-01-03T10:00:00Z', text: '' },
    { uuid: 'short', creationDate: '2021-01-03T10:00:00Z', text: 'bad id' },
    { uuid: 'D1B2C3D4E5F60718293A4B5C6D7E8F93', creationDate: 'not a date', text: 'bad date' },
  ],
});

test('Y2/Y3 Day One JSON: title, unescaping, own time zone, empty and bad entries counted, stable ids', () => {
  const r = parseAnyImport(DAYONE);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.items.length, 2);
  assert.equal(r.invalid, 3);
  const a = r.items[0];
  assert.equal(a.day, '2020-05-17', '22:30 UTC is 18:30 in New York, same day; UTC would also be 17th');
  assert.equal(a.entry.title, 'My title');
  assert.equal(a.entry.text, 'First 1. thing - done');
  assert.deepEqual(a.entry.tags, ['Travel', 'x']);
  assert.equal(a.id, 'dayone-A1B2C3D4E5F60718293A4B5C6D7E8F90');
  assert.equal(r.items[1].entry.title, '');
  const again = parseAnyImport(DAYONE);
  assert.ok(again.ok && again.items.map((i) => i.id).join() === r.items.map((i) => i.id).join(), 'same ids every time');
  const late = parseDayOne({ entries: [{ uuid: 'E1B2C3D4E5F60718', creationDate: '2020-05-18T02:30:00Z', timeZone: 'America/New_York', text: 'late' }] });
  assert.ok(late.ok && late.items[0].day === '2020-05-17', 'local evening stays on its own day');
  const unknownZone = parseDayOne({ entries: [{ uuid: 'F1B2C3D4E5F60718', creationDate: '2020-05-18T02:30:00Z', timeZone: 'Nowhere/Land', text: 'x' }] });
  assert.ok(unknownZone.ok && unknownZone.items[0].day === '2020-05-18');
});

test('Y3 limits and ids are accepted by the storage rules', () => {
  const ID = /^[A-Za-z0-9-]{8,64}$/;
  const r = parseAnyImport(DAYONE);
  assert.ok(r.ok && r.items.every((i) => ID.test(i.id)));
  const d = parseDaylio(DAYLIO);
  assert.ok(d.ok && d.items.every((i) => ID.test(i.id)));
  assert.deepEqual(parseAnyImport('x'.repeat(21 * 1024 * 1024)), { ok: false, reason: 'too-big' });
});

test('Y4 detection: own JSON still works; anything else is refused', () => {
  const own = JSON.stringify({ app: 'Private Diary', format: 1, entries: [{ id: 'abcdefgh1', date: '2024-01-01', text: 'hi', mood: 4, title: '', tags: [] }] });
  const o = parseAnyImport(own);
  assert.ok(o.ok && o.items.length === 1);
  assert.deepEqual(parseAnyImport('{"app":"Other","format":1,"entries":[]}'), { ok: false, reason: 'wrong-app' });
  assert.deepEqual(parseAnyImport('{"entries":[{"uuid":1}]}'), { ok: false, reason: 'wrong-app' });
  assert.deepEqual(parseAnyImport('not json {'), { ok: false, reason: 'not-json' });
  assert.deepEqual(parseAnyImport('{ broken'), { ok: false, reason: 'not-json' });
  assert.deepEqual(parseAnyImport('full_date,foo\n1,2'), { ok: false, reason: 'wrong-csv' });
  assert.deepEqual(parseAnyImport('a,b\n1,2'), { ok: false, reason: 'not-json' });
});
