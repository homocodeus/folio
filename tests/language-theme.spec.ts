import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resumeLanguages } from '../src/resume-language';

test('resume language localizes previews and exports, persists, and preserves content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example CV' }).click();
  for (const language of resumeLanguages) {
    await page.getByLabel('Resume language', { exact: true }).selectOption(language.id);
    await expect(page.locator('.preview-paper [data-section="experience"] h2')).toHaveText(language.experience);
    await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Alex Morgan');
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    const bytes = await readFile((await (await waiting).path())!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  }
  await page.getByLabel('Resume language', { exact: true }).selectOption('tr');
  await expect(page.getByRole('button', { name: 'All changes saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Product designer', exact: true }).click();
  await expect(page.getByLabel('Resume language', { exact: true })).toHaveValue('tr');
  await expect(page.locator('.preview-paper [data-section="education"] h2')).toHaveText('Eğitim');
});

test('light dark and system themes persist without darkening resume paper', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.getByLabel('Appearance', { exact: true }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Open example CV' }).click();
  await expect(page.locator('.preview-paper .resume')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.editor-tabs')).toHaveCSS('background-color', 'rgb(28, 40, 34)');
  await expect(page.locator('.entry-form').first()).toHaveCSS('background-color', 'rgb(32, 46, 38)');
  await page.screenshot({ path: 'test-results/dark-editor.png', fullPage: true });
  await page.reload();
  await expect(page.getByLabel('Appearance', { exact: true })).toHaveValue('dark');
  await page.getByLabel('Appearance', { exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('Appearance', { exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
