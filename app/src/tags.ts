export const MAX_TAG_LENGTH = 30;
export const MAX_TAGS = 10;

/** One tag typed by the user, cleaned: no leading #, single spaces, at most 30 characters. Empty means "ignore". */
export function cleanTag(raw: string): string {
  return raw.replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
}

/** Adds a tag to a list: ignores empties and duplicates (any letter case), keeps the first spelling, caps at 10. */
export function addTag(tags: string[], raw: string): string[] {
  const t = cleanTag(raw);
  if (!t) return tags;
  if (tags.length >= MAX_TAGS) return tags;
  const lower = t.toLocaleLowerCase();
  if (tags.some((x) => x.toLocaleLowerCase() === lower)) return tags;
  return [...tags, t];
}

/** Cleans a whole list (used when reading older or imported data). */
export function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.reduce<string[]>((acc, x) => (typeof x === 'string' ? addTag(acc, x) : acc), []);
}
