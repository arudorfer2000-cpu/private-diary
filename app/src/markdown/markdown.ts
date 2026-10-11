import type { StoredEntry } from '../storage/entryRepository';

export type Inline = { kind: 'text' | 'bold' | 'italic' | 'link'; text: string };
export type Block =
  | { kind: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; inlines: Inline[] }
  | { kind: 'li'; marker: string; inlines: Inline[] };

const TOKEN = /(\*\*(?=\S)[^*\n]*?\S\*\*|\*(?=[^\s*])[^*\n]*?[^\s*]\*|\*[^\s*]\*|\[\[[^[\]\n]+\]\])/g;

/** Bold, italic and [[links]] inside one line. Anything that is not closed stays exactly as typed. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: line.slice(last, at) });
    const tok = m[0];
    if (tok.startsWith('[[')) out.push({ kind: 'link', text: tok.slice(2, -2).trim() });
    else if (tok.startsWith('**')) out.push({ kind: 'bold', text: tok.slice(2, -2) });
    else out.push({ kind: 'italic', text: tok.slice(1, -1) });
    last = at + tok.length;
  }
  if (last < line.length) out.push({ kind: 'text', text: line.slice(last) });
  return out;
}

/**
 * Turns diary text into display blocks. Supports #, ##, ### headings, > quotes, "-"/"*" and "1." lists, bold, italic and
 * [[links]]. The result is data for the screen to draw; no HTML is produced and nothing is executed.
 */
export function parseMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', inlines: parseInline(para.join('\n')) });
    para = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      flush();
      blocks.push({ kind: (['h1', 'h2', 'h3'] as const)[m[1].length - 1], inlines: parseInline(m[2]) });
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      blocks.push({ kind: 'quote', inlines: parseInline(m[1]) });
    } else if ((m = line.match(/^\s*[-*]\s+(.+)$/))) {
      flush();
      blocks.push({ kind: 'li', marker: '•', inlines: parseInline(m[1]) });
    } else if ((m = line.match(/^\s*(\d{1,3})[.)]\s+(.+)$/))) {
      flush();
      blocks.push({ kind: 'li', marker: `${m[1]}.`, inlines: parseInline(m[2]) });
    } else para.push(line);
  }
  flush();
  return blocks;
}

const norm = (s: string) => s.normalize('NFKC').trim().toLocaleLowerCase();

/** Titles linked with [[Title]] in a text, once each (any letter case counts as the same). */
export function extractLinks(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/\[\[([^[\]\n]+)\]\]/g)) {
    const title = m[1].trim();
    const k = norm(title);
    if (title && !seen.has(k)) {
      seen.add(k);
      out.push(title);
    }
  }
  return out;
}

const newestFirst = (a: StoredEntry, b: StoredEntry) => (a.day === b.day ? b.updatedAt - a.updatedAt : a.day < b.day ? 1 : -1);

/** The entry a link points to: same title in any letter case; with several, the newest. Trashed entries never match. */
export function resolveLink(title: string, items: StoredEntry[]): StoredEntry | null {
  const k = norm(title);
  if (!k) return null;
  return items.filter((i) => i.deletedAt === null && norm(i.entry.title) === k).sort(newestFirst)[0] ?? null;
}

/** Entries whose text links to this title, newest first. The entry itself and trashed entries are left out. */
export function linkedFrom(title: string, items: StoredEntry[], selfId: string | null): StoredEntry[] {
  const k = norm(title);
  if (!k) return [];
  return items
    .filter((i) => i.deletedAt === null && i.id !== selfId && extractLinks(i.entry.text).some((l) => norm(l) === k))
    .sort(newestFirst);
}
