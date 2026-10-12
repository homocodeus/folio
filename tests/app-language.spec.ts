import { expect, test } from '@playwright/test';
import { resumeLanguages } from '../src/resume-language';

test('all empty resume placeholders follow the selected resume language', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a CV', exact: true }).click();
  for (const language of resumeLanguages) {
    await page.getByLabel('Resume language', { exact: true }).selectOption(language.id);
    const preview = page.locator('.preview-paper .resume');
    await expect(preview.locator('h1')).toHaveText(language.placeholder);
    await expect(preview).toContainText(language.headline);
    await expect(preview).toContainText(language.contact);
    await expect(preview).toContainText(language.emptyTitle);
    await expect(preview).toContainText(language.emptyHint);
    if (language.id !== 'en') await expect(preview).not.toContainText('Your professional headline');
  }
});

test('app language is independent, persistent, and does not replace user text', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('App language', { exact: true }).selectOption('es');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.getByRole('button', { name: 'Crear currículum', exact: true }).click();
  await page.getByLabel('Nombre completo', { exact: true }).fill('Keep my original name');
  await page.getByLabel('Idioma del currículum', { exact: true }).selectOption('tr');
  await expect(page.locator('.preview-paper .resume')).toContainText('Mesleki unvanınız');
  await page.getByLabel('Idioma de la aplicación', { exact: true }).selectOption('de');
  await expect(page.getByLabel('Vollständiger Name', { exact: true })).toHaveValue('Keep my original name');
  await expect(page.getByLabel('Lebenslauf-Sprache', { exact: true })).toHaveValue('tr');
  await page.getByRole('button', { name: 'Interview', exact: true }).click();
  await expect(page.locator('.question-card')).toContainText('Wie lautet dein vollständiger Name?');
  await page.getByLabel('App-Sprache', { exact: true }).selectOption('tr');
  await expect(page.locator('.question-card')).toContainText('Adınız ve soyadınız nedir?');
  await page.getByRole('button', { name: 'Bilgiler', exact: true }).click();
  await expect(page.getByLabel('Ad soyad', { exact: true })).toHaveValue('Keep my original name');
  await expect(page.getByRole('button', { name: 'Tüm değişiklikler kaydedildi' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Uygulama dili', { exact: true })).toHaveValue('tr');
  await page.getByRole('button', { name: 'Currículum sin título düzenle', exact: true }).click();
  await expect(page.getByLabel('Özgeçmiş dili', { exact: true })).toHaveValue('tr');
  await page.getByRole('button', { name: 'Ayarlar ve bağlantılar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Çalışma alanı ayarları' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Yapay zekâ asistanı bağla' })).toBeVisible();
  await page.getByRole('button', { name: 'Ayarları kapat', exact: true }).click();
  await page.getByRole('button', { name: 'Portre', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Portre tarzı', exact: true })).toHaveValue('A tailored navy business suit with a white shirt');
  await page.getByRole('button', { name: 'Tasarım', exact: true }).click();
  await page.getByRole('button', { name: 'Şablon düzenleyiciyi aç', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Şablon Düzenleme Stüdyosu' })).toBeVisible();
  await expect(page.getByLabel('Profil başlığı', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Şablon düzenleyiciyi kapat', exact: true }).click();
  await page.getByRole('button', { name: 'Bilgiler', exact: true }).click();
  await page.screenshot({ path: 'test-results/turkish-app.png', fullPage: true });
  await page.getByLabel('Uygulama dili', { exact: true }).selectOption('en');
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Keep my original name');
});
