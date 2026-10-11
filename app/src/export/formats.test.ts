import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportDocx, exportHtml, exportText } from './exporters';
import { crc32, makeZip, utf8 } from './zip';
import { makeT } from '../i18n/i18n';
import type { StoredEntry } from '../storage/entryRepository';

const NOW = new Date(2026, 9, 11, 12, 0);
const mk = (id: string, day: string, mood: number, title: string, text: string, tags: string[], createdAt: number, deletedAt: number | null = null): StoredEntry => ({
  id, day, createdAt, updatedAt: createdAt, deletedAt, entry: { mood, title, text, tags },
});
const SET = [
  mk('c', '2026-10-05', 5, 'Hike & <b>"fun"</b> 🏔', 'Über den Wolken.\nZweite Zeile\n\nNew paragraph with <script>alert(1)</script> & more', ['Family', 'out doors'], 3000),
  mk('a', '2026-09-30', 2, '', 'Short one.', [], 1000),
  mk('t', '2026-10-01', 1, 'Trashed one', 'must-not-be-exported-xyz', [], 500, 99999),
];

test('X1 plain text: readable, ordered, no trash, German', () => {
  const s = exportText(SET, NOW);
  assert.ok(s.indexOf('Short one.') < s.indexOf('Über den Wolken.'));
  assert.ok(!s.includes('must-not-be-exported-xyz') && s.includes('#out-doors') && s.includes('Mood: Great'));
  const de = exportText(SET, NOW, makeT('de'));
  assert.ok(de.includes('Oktober') && de.includes('Ohne Titel'), de.slice(0, 300));
  assert.ok(exportText([], NOW).includes('There are no entries yet.'));
});

test('X2 docx: a real Word file that python-docx can read, text intact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'docx-'));
  try {
    const f = join(dir, 'd.docx');
    writeFileSync(f, exportDocx(SET, NOW));
    const py = `import sys,json,zipfile,docx\nz=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None\nd=docx.Document(sys.argv[1])\nprint(json.dumps([[p.style.name,p.text] for p in d.paragraphs]))`;
    const out = JSON.parse(execFileSync('python3', ['-I', '-c', py, f], { encoding: 'utf8' })) as [string, string][];
    const all = out.map((o) => o[1]).join('\n');
    assert.equal(out[0][0], 'Title');
    assert.ok(all.includes('Hike & <b>"fun"</b> 🏔') && all.includes('Über den Wolken.\nZweite Zeile') && all.includes('<script>alert(1)</script> & more'));
    assert.ok(!all.includes('must-not-be-exported-xyz'));
    assert.equal(out.filter((o) => o[0] === 'Heading 2').length, 2);
    // control characters never break the file
    const bad = [mk('z', '2026-10-06', 3, 'x\u0001y', 'a\u0000b\u000bc', [], 1)];
    writeFileSync(f, exportDocx(bad, NOW));
    const o2 = JSON.parse(execFileSync('python3', ['-I', '-c', py, f], { encoding: 'utf8' })) as [string, string][];
    assert.ok(o2.some((o) => o[1].endsWith('— xy')) && o2.some((o) => o[1] === 'abc'));
    // empty diary
    writeFileSync(f, exportDocx([], NOW));
    execFileSync('python3', ['-I', '-c', py, f]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('X3 html for the PDF: everything escaped, no script, language', () => {
  const h = exportHtml(SET, NOW, makeT('de'), 'de');
  assert.ok(!/<script/i.test(h) && !h.includes('<b>') && h.includes('&lt;script&gt;alert(1)&lt;/script&gt;') && h.includes('&amp; more'));
  assert.ok(h.startsWith('<!doctype html><html lang="de">') && h.includes('<title>Private Diary</title>') && !h.includes('must-not-be-exported-xyz'));
  assert.ok(!/https?:\/\//.test(h), 'no external resource');
});

test('X4 zip writer: CRC32 vectors and readable by Python', () => {
  assert.equal(crc32(utf8('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
  const dir = mkdtempSync(join(tmpdir(), 'zip-'));
  try {
    const f = join(dir, 'a.zip');
    writeFileSync(f, makeZip([{ name: 'a.txt', data: utf8('hello ü🏔') }, { name: 'dir/b.bin', data: Uint8Array.from([0, 1, 2, 255]) }]));
    const py = `import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None\nprint(z.read('a.txt').decode(), list(z.read('dir/b.bin')), z.namelist())`;
    assert.equal(execFileSync('python3', ['-I', '-c', py, f], { encoding: 'utf8' }).trim(), "hello ü🏔 [0, 1, 2, 255] ['a.txt', 'dir/b.bin']");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
