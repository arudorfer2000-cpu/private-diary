// Checks the PWA post-processing on a small fake export (no browser needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./pwa.mjs', import.meta.url));
const make = (js) => {
  const d = mkdtempSync(join(tmpdir(), 'pwa-'));
  mkdirSync(join(d, '_expo'));
  writeFileSync(join(d, 'index.html'), '<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" /></head><body><div id="root"></div><script src="/_expo/app.js" defer></script></body></html>');
  writeFileSync(join(d, '_expo', 'app.js'), js);
  writeFileSync(join(d, 'metadata.json'), '{}');
  writeFileSync(join(d, 'register.js'), 'x');
  return d;
};

test('W3.1 manifest, icons and Apple tags are written with relative paths', () => {
  const d = make('a');
  execFileSync('node', [script, d]);
  const m = JSON.parse(readFileSync(join(d, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url === './' && m.scope === './');
  assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  assert.ok(m.icons.every((i) => !i.src.startsWith('/')));
  const h = readFileSync(join(d, 'index.html'), 'utf8');
  for (const s of ['rel="manifest"', 'rel="apple-touch-icon"', 'apple-mobile-web-app-capable', 'viewport-fit=cover']) assert.ok(h.includes(s), s);
  assert.equal(h.match(/register\.js/g).length, 1);
  execFileSync('node', [script, d]); // running twice must not duplicate anything
  assert.equal(readFileSync(join(d, 'index.html'), 'utf8').match(/register\.js/g).length, 1);
  assert.equal(readFileSync(join(d, 'index.html'), 'utf8').match(/Content-Security-Policy/g).length, 1);
});

test('W3.3 CSP allows nothing but this site; the service worker never calls another site', () => {
  const d = make('a');
  execFileSync('node', [script, d]);
  const h = readFileSync(join(d, 'index.html'), 'utf8');
  const csp = h.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'(;|$)/);
  assert.ok(!/https?:|\*/.test(csp), 'no remote source and no wildcard');
  const sw = readFileSync(join(d, 'sw.js'), 'utf8');
  assert.ok(!/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, '')), 'no URL in the service worker');
  const fetches = sw.match(/\bfetch\s*\(/g) ?? [];
  assert.deepEqual(fetches.length, 1);
  assert.ok(sw.includes('fetch(req)'));
  assert.ok(sw.includes('new URL(req.url).origin !== self.location.origin'), 'foreign origins are not touched');
});

test('W3.4 the cache version changes when a file changes; the file list is exact', () => {
  const a = make('one');
  const b = make('two');
  execFileSync('node', [script, a]);
  execFileSync('node', [script, b]);
  const va = readFileSync(join(a, 'sw.js'), 'utf8').match(/private-diary-([0-9a-f]{12})/)[1];
  const vb = readFileSync(join(b, 'sw.js'), 'utf8').match(/private-diary-([0-9a-f]{12})/)[1];
  assert.notEqual(va, vb);
  const list = JSON.parse(readFileSync(join(a, 'sw.js'), 'utf8').match(/const FILES = (\[[\s\S]*?\]);/)[1]);
  assert.ok(list.includes('./') && list.includes('_expo/app.js') && list.includes('index.html'));
  assert.ok(!list.includes('sw.js') && !list.includes('metadata.json'));
  assert.ok(existsSync(join(a, 'manifest.webmanifest')));
});

test('W4.1 headers file carries the same policy plus frame protection', () => {
  const d = make('a');
  execFileSync('node', [script, d]);
  const h = readFileSync(join(d, '_headers'), 'utf8');
  assert.match(h, /Content-Security-Policy: default-src 'none'/);
  assert.match(h, /frame-ancestors 'none'/);
  assert.match(h, /\/sw\.js\n  Cache-Control: no-cache/);
  const meta = readFileSync(join(d, 'index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(h.includes(meta), 'meta policy and header policy are the same');
  const list = JSON.parse(readFileSync(join(d, 'sw.js'), 'utf8').match(/const FILES = (\[[\s\S]*?\]);/)[1]);
  assert.ok(!list.includes('_headers'));
});
