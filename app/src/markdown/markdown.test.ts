import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StoredEntry } from '../storage/entryRepository';
import { extractLinks, linkedFrom, parseInline, parseMarkdown, resolveLink } from './markdown';

test('K1 blocks: headings, quotes, lists, paragraphs', () => {
  const b = parseMarkdown('# Big\n## Mid\n### Small\n#### too deep\n\n> a quote\n- one\n* two\n1. first\n2) second\n\nplain line one\nplain line two\n\n\nlast');
  assert.deepEqual(b.map((x) => x.kind), ['h1', 'h2', 'h3', 'p', 'quote', 'li', 'li', 'li', 'li', 'p', 'p']);
  assert.equal((b[3] as { inlines: { text: string }[] }).inlines[0].text, '#### too deep'); // 4 hashes: plain text
  assert.deepEqual(b.filter((x) => x.kind === 'li').map((x) => (x as { marker: string }).marker), ['•', '•', '1.', '2.']);
  assert.equal((b[9] as { inlines: { text: string }[] }).inlines[0].text, 'plain line one\nplain line two'); // lines of one paragraph keep their breaks
});

test('K1 inline: bold, italic, links; unclosed markers stay as typed', () => {
  assert.deepEqual(parseInline('a **b** c *d* e [[F g]]'), [
    { kind: 'text', text: 'a ' }, { kind: 'bold', text: 'b' }, { kind: 'text', text: ' c ' }, { kind: 'italic', text: 'd' },
    { kind: 'text', text: ' e ' }, { kind: 'link', text: 'F g' },
  ]);
  for (const plain of ['**not closed', '*also not', '2 * 3 * 4', '[[open', '** spaced **', 'a ** b']) {
    assert.deepEqual(parseInline(plain), [{ kind: 'text', text: plain }], plain);
  }
  assert.deepEqual(parseInline('[[  Trim me ]]'), [{ kind: 'link', text: 'Trim me' }]);
});

test('K1 safety: HTML and script text is only ever text', () => {
  const b = parseMarkdown('<script>alert(1)</script> <b>x</b> [x](javascript:alert(1))');
  assert.equal(b.length, 1);
  assert.deepEqual((b[0] as { inlines: unknown[] }).inlines, [{ kind: 'text', text: '<script>alert(1)</script> <b>x</b> [x](javascript:alert(1))' }]);
});

let n = 0;
const mk = (day: string, title: string, text: string, deletedAt: number | null = null): StoredEntry => ({ id: 'e' + ++n, day, createdAt: n, updatedAt: n, deletedAt, entry: { mood: 3, title, text, tags: [] } });

test('K3 links: extract once per title, resolve case-insensitively to the newest entry, trashed never', () => {
  assert.deepEqual(extractLinks('see [[Trip]] and [[trip]] and [[ Other ]] [[]]'), ['Trip', 'Other']);
  const items = [mk('2026-01-01', 'Trip', ''), mk('2026-05-01', 'trip', ''), mk('2026-06-01', 'Trip', '', 5), mk('2026-02-01', 'Other', '')];
  assert.equal(resolveLink('TRIP', items)?.day, '2026-05-01');
  assert.equal(resolveLink('Other', items)?.day, '2026-02-01');
  assert.equal(resolveLink('Missing', items), null);
  assert.equal(resolveLink('  ', items), null);
});

test('K4 linked from: entries that link to this title, not itself, not trashed, newest first', () => {
  const self = mk('2026-03-01', 'Trip', 'my own [[Trip]] link');
  const items = [
    self,
    mk('2026-04-01', 'A', 'remember [[trip]]'),
    mk('2026-05-01', 'B', 'again [[Trip]] here'),
    mk('2026-06-01', 'C', '[[Trip]] but trashed', 9),
    mk('2026-07-01', 'D', 'no link, just the word Trip'),
  ];
  assert.deepEqual(linkedFrom('Trip', items, self.id).map((x) => x.entry.title), ['B', 'A']);
  assert.deepEqual(linkedFrom('', items, null), []);
});
