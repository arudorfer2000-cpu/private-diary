// Y2: the audit must catch planted violations (so it is not vacuous).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audit } from './audit.mjs';

const tree = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'audit-'));
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), c); }
  return root;
};
const cases = [
  ['R1-no-network', 'src/a.ts', "export const x = () => fetch('/x');"],
  ['R1-no-network', 'src/a.ts', 'const s = new WebSocket(u);'],
  ['R1-no-network', 'src/a.ts', "const u = 'https://example.com/track';"],
  ['R2-no-console', 'src/a.ts', 'console.log(entry.text);'],
  ['R3-parameterised-sql', 'src/storage/r.ts', 'await db.run(`DELETE FROM entries WHERE id = ${id}`);'],
  ['R3-parameterised-sql', 'src/storage/r.ts', "await db.all('SELECT * FROM entries WHERE day = ' + day);"],
  ['R4-crypto-only-in-crypto', 'src/screens/S.tsx', "import { sha256 } from '@noble/hashes/sha2.js';"],
  ['R4-crypto-only-in-crypto', 'src/a.ts', "import * as C from 'expo-crypto';"],
  ['R5-secrets-only-via-vault', 'src/a.ts', "await SecureStore.setItemAsync('k', hex);"],
  ['R5-secrets-only-via-vault', 'src/ui/b.tsx', "AsyncStorage.setItem('passcode', p);"],
  ['R6-no-clipboard-or-share', 'src/screens/S.tsx', 'Clipboard.setStringAsync(entry.text);'],
];
for (const [rule, file, code] of cases) {
  test(`detects ${rule}: ${code.slice(0, 40)}`, () => {
    const root = tree({ [file]: code });
    try { assert.ok(audit(root).some((f) => f.startsWith(rule)), 'not detected'); } finally { rmSync(root, { recursive: true }); }
  });
}
test('allowed code passes: crypto import in src/crypto, storage in vault module, comments mention fetch', () => {
  const root = tree({
    'src/crypto/c.ts': "import { x } from '@noble/hashes/sha2.js';",
    'src/vault/secureStore.ts': 'SecureStore.setItemAsync(k, v);',
    'src/a.ts': '// we never call fetch() or console.log here\nexport const ok = 1;',
    'src/storage/r.ts': "await db.run('DELETE FROM entries WHERE id = ?', [id]);",
  });
  try { assert.deepEqual(audit(root), []); } finally { rmSync(root, { recursive: true }); }
});
