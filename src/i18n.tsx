import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import translations from './app-translations.json';

export const appLanguages = [{ id: 'en', name: 'English' }, { id: 'es', name: 'Español' }, { id: 'de', name: 'Deutsch' }, { id: 'tr', name: 'Türkçe' }] as const;
export type AppLanguage = typeof appLanguages[number]['id'];
export function translate(text: string, language: AppLanguage, values: Record<string, string | number> = {}): string {
  const translated = language === 'en' ? text : (translations as Record<string, Partial<Record<AppLanguage, string>>>)[text]?.[language] ?? text;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) => values[key] === undefined ? match : String(values[key]));
}
const LanguageContext = createContext<{ language: AppLanguage; setLanguage: (language: AppLanguage) => void }>({ language: 'en', setLanguage: () => {} });
export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    try { const saved = localStorage.getItem('folio.app-language'); return appLanguages.find(item => item.id === saved)?.id ?? 'en'; } catch { return 'en'; }
  });
  useEffect(() => { document.documentElement.lang = language; try { localStorage.setItem('folio.app-language', language); } catch {} }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}
export function useI18n() {
  const context = useContext(LanguageContext);
  return { ...context, t: (text: string, values?: Record<string, string | number>) => translate(text, context.language, values) };
}
export default function AppLanguagePicker() {
  const { language, setLanguage, t } = useI18n();
  return <label className="theme-picker">{t('App language')}<select aria-label={t('App language')} value={language} onChange={event => setLanguage(event.target.value as AppLanguage)}>{appLanguages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
}
