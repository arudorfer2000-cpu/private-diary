// Static security rules for the app source. Run: npm run audit  (optionally: node scripts/audit.mjs <root>)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function listSources(root) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (['node_modules', 'dist-web', 'dist', '.expo', 'e2e', 'scripts'].includes(n)) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(p);
    }
  };
  for (const top of ['App.tsx', 'src']) {
    const p = join(root, top);
    try { statSync(p).isDirectory() ? walk(p) : out.push(p); } catch { /* missing */ }
  }
  return out;
}

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');

export function audit(root) {
  const findings = [];
  for (const file of listSources(root)) {
    const rel = relative(root, file).split(sep).join('/');
    const code = strip(readFileSync(file, 'utf8'));
    const lines = code.split('\n');
    const add = (rule, i, msg) => findings.push(`${rule} ${rel}:${i + 1} ${msg}`);
    const webStandIn = /\.web\.tsx?$/.test(rel);
    lines.forEach((l, i) => {
      if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b\s*[(.]?/.test(l) && /\b(fetch\s*\(|new\s+(XMLHttpRequest|WebSocket|EventSource)|sendBeacon\s*\()/.test(l))
        add('R1-no-network', i, 'network API used');
      if (/https?:\/\/(?!www\.w3\.org)/.test(l) && !/^\s*(import|export)\b/.test(l)) add('R1-no-network', i, 'URL literal in code');
      if (/\bconsole\s*\./.test(l)) add('R2-no-console', i, 'console call');
      if (/\b(?:db|this\.db|database)\.(run|all|exec)\s*\(\s*`[^`]*\$\{/.test(l) || /\.(run|all)\s*\(\s*['"][^'"]*['"]\s*\+/.test(l))
        add('R3-parameterised-sql', i, 'SQL built from variables');
      if (!rel.startsWith('src/crypto/') && /from\s+['"]@noble\//.test(l)) add('R4-crypto-only-in-crypto', i, '@noble import outside src/crypto');
      if (!rel.startsWith('src/crypto/') && /from\s+['"](expo-crypto|crypto|node:crypto|tweetnacl|crypto-js)['"]/.test(l))
        add('R4-crypto-only-in-crypto', i, 'crypto library outside src/crypto');
      if (/\b(setItemAsync|setItem|AsyncStorage|MMKV)\b/.test(l) && !webStandIn && !/^src\/vault\/(secureStore|biometric)\.ts$/.test(rel))
        add('R5-secrets-only-via-vault', i, 'storage write outside the vault modules');
      if (/\b(Share\.share|Clipboard|setStringAsync)\b/.test(l) && !/^src\/export\//.test(rel)) add('R6-no-clipboard-or-share', i, 'clipboard/share outside export');
    });
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? process.cwd();
  const f = audit(root);
  if (f.length) { console.log(f.join('\n')); console.log(`\nAUDIT FAILED: ${f.length} finding(s)`); process.exit(1); }
  console.log(`AUDIT OK: ${listSources(root).length} files checked, 6 rules, 0 findings`);
}
