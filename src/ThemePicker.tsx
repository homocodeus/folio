import { useI18n } from './i18n';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
export default function ThemePicker() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(() => { try { const saved = localStorage.getItem('folio.theme'); return saved === 'dark' || saved === 'light' ? saved : 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => { document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; };
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
  return <label className="theme-picker">{t("Appearance")}<select aria-label={t("Appearance")} value={theme} onChange={event => { const next = event.target.value as Theme; setTheme(next); try { localStorage.setItem('folio.theme', next); } catch {} }}><option value="system">{t("System")}</option><option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option></select></label>;
}
