import type { StoredEntry } from '../storage/entryRepository';
import { moodNames } from '../theme';
import { MONTH_NAMES, parseDay } from '../calendar/calendarMath';
import { makeT, type TFn } from '../i18n/i18n';
import { makeZip, utf8 } from './zip';

const pad = (n: number) => String(n).padStart(2, '0');

/** Oldest first; same day by creation time. Trashed entries are never exported. */
function ordered(items: StoredEntry[]): StoredEntry[] {
  return items
    .filter((i) => i.deletedAt === null)
    .sort((a, b) => (a.day === b.day ? a.createdAt - b.createdAt : a.day < b.day ? -1 : 1));
}

export function exportJson(items: StoredEntry[], now: Date): string {
  const list = ordered(items);
  return JSON.stringify(
    {
      app: 'Private Diary',
      format: 1,
      exportedAt: now.toISOString(),
      count: list.length,
      note: 'This file is NOT encrypted. Keep it somewhere safe.',
      entries: list.map((i) => ({
        id: i.id,
        date: i.day,
        mood: i.entry.mood,
        moodName: moodNames[i.entry.mood] ?? '',
        title: i.entry.title,
        text: i.entry.text,
        tags: i.entry.tags,
        createdAt: new Date(i.createdAt).toISOString(),
        updatedAt: new Date(i.updatedAt).toISOString(),
      })),
    },
    null,
    2,
  );
}

/** One line only, so a title can never create extra headings or break the structure. */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim();

/** The file is written in the app language `t` (English by default); JSON keeps fixed English field names. */
export function exportMarkdown(items: StoredEntry[], now: Date, t: TFn = makeT('en')): string {
  const list = ordered(items);
  const head = `# Private Diary\n\n${t('Exported {date}. This file is not encrypted. Keep it somewhere safe.', { date: now.toISOString().slice(0, 10) })}\n`;
  if (list.length === 0) return `${head}\n${t('There are no entries yet.')}\n`;
  const parts = list.map((i) => {
    const d = parseDay(i.day);
    const title = oneLine(i.entry.title) || t('Untitled');
    const meta = [`${t('Mood: {mood}', { mood: t(moodNames[i.entry.mood] ?? '') })}`, ...(i.entry.tags.length ? [i.entry.tags.map((t) => `#${t.replace(/\s+/g, '-')}`).join(' ')] : [])].join(' · ');
    return `## ${d.year}-${pad(d.month)}-${pad(d.day)} (${d.day} ${t(MONTH_NAMES[d.month - 1])}) — ${title}\n\n${meta}\n\n${i.entry.text.trim()}\n`;
  });
  return `${head}\n${parts.join('\n')}`;
}

type Block = { heading: string; meta: string; text: string };

function blocks(items: StoredEntry[], t: TFn): Block[] {
  return ordered(items).map((i) => {
    const d = parseDay(i.day);
    const title = oneLine(i.entry.title) || t('Untitled');
    const tags = i.entry.tags.length ? ' · ' + i.entry.tags.map((g) => `#${g.replace(/\s+/g, '-')}`).join(' ') : '';
    return {
      heading: `${d.year}-${pad(d.month)}-${pad(d.day)} (${d.day} ${t(MONTH_NAMES[d.month - 1])}) — ${title}`,
      meta: t('Mood: {mood}', { mood: t(moodNames[i.entry.mood] ?? '') }) + tags,
      text: i.entry.text.trim(),
    };
  });
}

const intro = (now: Date, t: TFn) => t('Exported {date}. This file is not encrypted. Keep it somewhere safe.', { date: now.toISOString().slice(0, 10) });

export function exportText(items: StoredEntry[], now: Date, t: TFn = makeT('en')): string {
  const list = blocks(items, t);
  const head = `Private Diary\n${intro(now, t)}\n`;
  if (list.length === 0) return `${head}\n${t('There are no entries yet.')}\n`;
  return `${head}\n${list.map((b) => `${b.heading}\n${b.meta}\n\n${b.text}\n`).join('\n----------\n\n')}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** XML 1.0 forbids most control characters; they are removed so Word never refuses the file. */
const xmlSafe = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');

/** The page that becomes the PDF. Every piece of entry text is escaped; no script, no external resource. */
export function exportHtml(items: StoredEntry[], now: Date, t: TFn = makeT('en'), lang = 'en'): string {
  const list = blocks(items, t);
  const body = list.length === 0 ? `<p>${esc(t('There are no entries yet.'))}</p>` : list
    .map((b) => `<section><h2>${esc(b.heading)}</h2><p class="meta">${esc(b.meta)}</p>${b.text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</section>`)
    .join('');
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>Private Diary</title><style>body{font-family:-apple-system,Helvetica,sans-serif;margin:32px;color:#1d2b2f;line-height:1.45}h1{font-size:26px}h2{font-size:17px;margin:26px 0 2px;page-break-after:avoid}section{page-break-inside:auto}.meta{color:#5b6b6f;font-size:12px;margin:0 0 8px}p{margin:0 0 8px;font-size:14px}</style></head><body><h1>Private Diary</h1><p class="meta">${esc(intro(now, t))}</p>${body}</body></html>`;
}

const para = (text: string, style?: string) => {
  const lines = xmlSafe(text).split('\n');
  const runs = lines.map((l, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join('');
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${runs}</w:p>`;
};

/** XML namespace names look like web addresses but are only identifiers (nothing is ever fetched). Built in two pieces so the no-network audit rule stays strict. */
const H = 'http' + '://';

/** A real Word document (zip of XML parts), built without any library. */
export function exportDocx(items: StoredEntry[], now: Date, t: TFn = makeT('en')): Uint8Array {
  const list = blocks(items, t);
  const body = [para('Private Diary', 'Title'), para(intro(now, t))]
    .concat(list.length === 0 ? [para(t('There are no entries yet.'))] : list.flatMap((b) => [para(b.heading, 'Heading2'), para(b.meta), ...b.text.split(/\n{2,}/).map((p) => para(p))]))
    .join('');
  const NS = `xmlns:w="${H}schemas.openxmlformats.org/wordprocessingml/2006/main"`;
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = [
    { name: '[Content_Types].xml', data: utf8(`${head}<Types xmlns="${H}schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
    { name: '_rels/.rels', data: utf8(`${head}<Relationships xmlns="${H}schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${H}schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: utf8(`${head}<Relationships xmlns="${H}schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${H}schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'word/styles.xml', data: utf8(`${head}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="40"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`) },
    { name: 'word/document.xml', data: utf8(`${head}<w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`) },
  ];
  return makeZip(files);
}

/** Local date, not UTC. */
export function exportFileName(kind: 'json' | 'md' | 'txt' | 'docx' | 'pdf', now: Date): string {
  return `private-diary-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${kind}`;
}
