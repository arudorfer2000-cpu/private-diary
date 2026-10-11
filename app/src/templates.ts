import type { TFn } from './i18n/i18n';

export type Template = { id: string; name: string; body: string };

/** Built-in writing prompts. Names and text follow the app language. */
export function templates(t: TFn): Template[] {
  return [
    { id: 'gratitude', name: t('Gratitude'), body: t('Today I am grateful for:\n1. \n2. \n3. \n') },
    { id: 'evening', name: t('Evening review'), body: t('What went well today?\n\nWhat was hard?\n\nWhat will I do differently tomorrow?\n') },
    { id: 'stoic', name: t('Stoic'), body: t('What is in my control today, and what is not?\n\nWhere did I react in a way I did not choose?\n\nWhat would my best self do tomorrow?\n') },
    { id: 'bullet', name: t('Bullet journal'), body: t('- Done today\n- \n\n- Notes\n- \n\n- Tomorrow\n- \n') },
  ];
}

/** Empty entry: the template. Existing text: the template is added below, nothing is replaced. */
export function applyTemplate(current: string, body: string): string {
  return current.trim() === '' ? body : current.replace(/\s+$/, '') + '\n\n' + body;
}
