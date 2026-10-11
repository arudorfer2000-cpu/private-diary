import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { makeT, type Lang, type TFn } from './i18n/i18n';

type Value = { lang: Lang; t: TFn };
const I18nContext = createContext<Value>({ lang: 'en', t: makeT('en') });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
