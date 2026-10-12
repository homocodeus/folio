import { expect, it } from 'vitest';
import translations from './app-translations.json';
import { appLanguages, translate } from './i18n';

it('provides every app translation in each supported non-English language', () => {
  for (const [key, values] of Object.entries(translations)) {
    expect(translate(key, 'en')).toBe(key);
    for (const language of appLanguages.filter(item => item.id !== 'en')) expect(values[language.id as keyof typeof values]?.trim()).toBeTruthy();
  }
});
it('interpolates names without translating user content or interpreting markup', () => {
  expect(translate('Edit {name}', 'es', { name: '<My CV>' })).toBe('Editar <My CV>');
  expect(translate('Provider-specific raw error', 'de')).toBe('Provider-specific raw error');
  expect(translate('Full name', 'tr')).toBe('Ad soyad');
});
