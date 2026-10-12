import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { templates } from '../src/model';

test('create, edit, autosave, reload, duplicate, and delete a CV', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a CV', exact: true }).click();
  await page.getByLabel('CV document title').fill('Engineering CV');
  await page.getByLabel('Full name', { exact: true }).fill('Burak Şentürk');
  await page.getByLabel('Professional headline').fill('Software Engineer');
  await page.getByLabel('Email', { exact: true }).fill('burak@example.com');
  await page.getByRole('button', { name: 'Add experience', exact: true }).click();
  await page.getByLabel('Job title', { exact: true }).fill('Rust Developer');
  await page.getByLabel('Company', { exact: true }).fill('Acme');
  await page.getByLabel('Achievements').fill('Built a desktop application with Rust and Tauri.');
  await expect(page.getByRole('button', { name: 'All changes saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Engineering CV', exact: true }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Burak Şentürk');
  await expect(page.getByLabel('Job title', { exact: true })).toHaveValue('Rust Developer');
  await page.getByRole('button', { name: 'Back to CVs' }).click();
  await page.getByRole('button', { name: 'Actions for Engineering CV', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Engineering CV (copy)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Engineering CV (copy)', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete CV', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Engineering CV (copy)', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Engineering CV', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('guided interview fills a new CV and preserves answers in the editor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with an interview' }).click();
  const answers = ['Jordan Lee', 'Data Analyst', 'jordan@example.com', 'Hamburg', 'I build useful analytics for small teams.', 'Data Analyst at Example, 2021–2025. Built weekly reporting.', 'BSc Statistics, Example University, 2021', 'SQL, Python, Tableau'];
  for (const answer of answers) { await page.getByLabel('Your answer', { exact: true }).fill(answer); await page.getByRole('button', { name: 'Use answer', exact: true }).click(); }
  await expect(page.getByRole('heading', { name: 'Your story is taking shape.' })).toBeVisible();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Jordan Lee');
  await expect(page.getByLabel('Achievements')).toHaveValue(answers[5]);
  await expect(page.getByLabel('Skills (one per line)')).toHaveValue('SQL\nPython\nTableau');
});

test('interview progress and draft survive reload and remain separate per CV', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with an interview' }).click();
  await page.getByLabel('CV document title').fill('Saved conversation');
  await page.getByLabel('Your answer', { exact: true }).fill('Burak');
  await page.getByRole('button', { name: 'Use answer', exact: true }).click();
  await page.getByRole('button', { name: 'Skip this question', exact: true }).click();
  await page.getByLabel('Your answer', { exact: true }).fill('Unsent email draft');
  await expect(page.getByRole('button', { name: 'All changes saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Saved conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Interview', exact: true }).click();
  await expect(page.locator('.chat-history')).toContainText('Burak');
  await expect(page.locator('.interview-progress')).toContainText('2 / 8');
  await expect(page.getByLabel('Your answer', { exact: true })).toHaveValue('Unsent email draft');
  await page.getByRole('button', { name: 'Back to CVs' }).click();
  await page.getByRole('button', { name: 'Start with an interview' }).click();
  await expect(page.locator('.chat-history')).not.toContainText('Burak');
  await expect(page.locator('.interview-progress')).toContainText('0 / 8');
  await expect(page.getByLabel('Your answer', { exact: true })).toHaveValue('');
});

test('all designs export valid PDFs, including multipage CVs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example CV' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Burak Şentürk');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  for (const template of templates) {
    await page.getByRole('button', { name: new RegExp(`^${template.name} `) }).click();
    await expect(page.locator(`.preview-paper .resume.${template.id}`)).toBeVisible();
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    const download = await waiting;
    const path = await download.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(path!);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
    expect(bytes.toString('latin1')).toContain('/Type /Page');
  }
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.getByLabel('Achievements').first().fill(Array.from({ length: 90 }, (_, index) => `Achievement ${index + 1}: Collaborated with the engineering team to deliver a reliable and accessible customer experience.`).join('\n'));
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  for (const template of templates.slice(3)) {
    await page.getByRole('button', { name: new RegExp(`^${template.name} `) }).click();
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    const bytes = await readFile((await (await waiting).path())!);
    expect((bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
  }
});

test('new template gallery creates a CV and design changes preserve content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Template studio', exact: true }).click();
  await expect(page.locator('.template-card')).toHaveCount(8);
  await page.screenshot({ path: 'test-results/templates.png', fullPage: true });
  const studio = page.locator('.template-card').filter({ has: page.getByRole('heading', { name: 'Studio', exact: true }) });
  await studio.getByRole('button', { name: 'Use this template' }).click();
  await page.getByLabel('Full name', { exact: true }).fill('Alex Morgan');
  await page.getByLabel('Your professional summary').fill('My original professional profile.');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByLabel('Custom accent color')).toHaveValue('#804c76');
  for (const name of ['Executive', 'Studio', 'Nordic', 'Timeline', 'Monogram']) {
    await page.getByRole('button', { name: new RegExp(`^${name} `) }).click();
    await expect(page.locator(`.preview-paper .resume.${name.toLowerCase()}`)).toContainText('My original professional profile.');
    await expect(page.getByLabel('Custom accent color')).toHaveValue('#804c76');
    await page.locator('.preview-paper').screenshot({ path: `test-results/template-${name.toLowerCase()}.png` });
  }
  await expect(page.locator('.preview-paper .resume-monogram')).toHaveText('AM');
  await expect(page.getByRole('button', { name: 'All changes saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Untitled CV', exact: true }).click();
  await expect(page.locator('.preview-paper .resume.monogram')).toContainText('My original professional profile.');
  await page.getByRole('button', { name: 'Back to CVs' }).click();
  await page.getByRole('button', { name: 'Template studio', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('backup round trip and settings stay local', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example CV' }).click();
  await page.getByRole('button', { name: 'Back to CVs' }).click();
  await page.getByRole('button', { name: 'Actions for Product designer', exact: true }).click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save backup', exact: true }).click();
  const download = await waiting;
  const path = (await download.path())!;
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(backup.name).toBe('Alex Morgan');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(path);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Alex Morgan');
  await page.getByRole('button', { name: 'Back to CVs' }).click();
  await expect(page.getByRole('button', { name: 'Edit Product designer', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Settings & connections' }).click();
  await page.getByText('Advanced API settings · text, portraits & voice', { exact: true }).click();
  await page.getByLabel('API base URL').fill('http://localhost:11434/v1');
  await page.getByLabel('API key', { exact: true }).fill('do-not-store-this');
  await page.getByRole('button', { name: 'Save settings' }).click();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('do-not-store-this');
});

test('workspace screenshots and narrow-screen layout', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example CV' }).click();
  await page.getByRole('button', { name: 'Back to CVs' }).click();
  await page.screenshot({ path: 'test-results/workspace.png', fullPage: true });
  await page.getByRole('button', { name: 'Edit Product designer', exact: true }).click();
  await page.screenshot({ path: 'test-results/editor.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('camera capture inserts a portrait and releases the camera', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const state = window as unknown as { capturedTracks: MediaStreamTrack[] };
    state.capturedTracks = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      state.capturedTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open example CV' }).click();
  await page.getByRole('button', { name: 'Portrait', exact: true }).click();
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Capture photo', exact: true }).click();
  await expect(page.getByRole('img', { name: 'CV portrait', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { capturedTracks: MediaStreamTrack[] }).capturedTracks.every(track => track.readyState === 'ended'))).toBe(true);
  await expect(page.getByRole('button', { name: 'All changes saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Product designer', exact: true }).click();
  await expect(page.getByRole('img', { name: 'CV portrait', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  for (const template of templates) {
    await page.getByRole('button', { name: new RegExp(`^${template.name} `) }).click();
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    const bytes = await readFile((await (await waiting).path())!);
    expect(bytes.toString('latin1')).toContain('/Subtype /Image');
  }
});
