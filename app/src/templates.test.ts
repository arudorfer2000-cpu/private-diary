import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeT } from './i18n/i18n';
import { applyTemplate, templates } from './templates';

test('W1 four templates in English and German; insert fills empty text and appends otherwise', () => {
  const en = templates(makeT('en'));
  const de = templates(makeT('de'));
  assert.deepEqual(en.map((x) => x.name), ['Gratitude', 'Evening review', 'Stoic', 'Bullet journal']);
  assert.deepEqual(de.map((x) => x.name), ['Dankbarkeit', 'Abendrückblick', 'Stoisch', 'Bullet Journal']);
  for (let i = 0; i < 4; i++) {
    assert.notEqual(en[i].body, de[i].body);
    assert.ok(en[i].body.trim().length > 20 && de[i].body.trim().length > 20);
  }
  assert.equal(applyTemplate('', en[0].body), en[0].body);
  assert.equal(applyTemplate('   \n ', en[0].body), en[0].body);
  const mine = 'Mein eigener Text.\n\n';
  const out = applyTemplate(mine, en[1].body);
  assert.ok(out.startsWith('Mein eigener Text.'), 'existing text kept in front');
  assert.ok(out.endsWith(en[1].body));
  assert.equal(out, 'Mein eigener Text.\n\n' + en[1].body);
});
