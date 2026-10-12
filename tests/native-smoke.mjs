import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

let browser;
for (let attempt = 0; attempt < 40; attempt += 1) {
  try { browser = await chromium.connectOverCDP('http://127.0.0.1:9223'); break; }
  catch { await new Promise(resolve => setTimeout(resolve, 500)); }
}
assert.ok(browser, 'Could not connect to the desktop WebView2');
const context = browser.contexts()[0];
let page;
for (let attempt = 0; attempt < 30; attempt += 1) {
  page = context.pages().find(candidate => candidate.url().includes('tauri.localhost'));
  if (page) break;
  await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(page, 'The desktop webview was not available');
await page.waitForSelector('.library-page');
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let createdId;
let templateId;
try {
  await page.getByRole('button', { name: 'Create a CV', exact: true }).click();
  await page.getByLabel('CV document title').fill('Native smoke test');
  await page.getByLabel('Full name', { exact: true }).fill('Native Persistence Test');
  await page.getByLabel('Professional headline').fill('Desktop validation');
  await page.getByRole('button', { name: 'All changes saved' }).waitFor();
  const documents = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_cvs'));
  const document = documents.find(item => item.title === 'Native smoke test');
  assert.equal(document.name, 'Native Persistence Test');
  createdId = document.id;
  await page.reload();
  await page.getByRole('button', { name: 'Edit Native smoke test', exact: true }).click();
  assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), 'Native Persistence Test');
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Open Template Editor' }).click();
  await page.getByLabel('Template name', { exact: true }).fill(`Native design ${Date.now()}`);
  await page.getByLabel('Typeface', { exact: true }).selectOption('serif');
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await page.locator('.studio-status').getByText('Template saved on this device').waitFor();
  const presets = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('list_templates'));
  const preset = presets.find(item => item.name.startsWith('Native design '));
  assert.equal(preset.design.font, 'serif');
  templateId = preset.id;
  assert.equal(preset.photo, undefined);
  await page.getByRole('button', { name: 'Apply to CV', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  document.design = preset.design;
  const pdfPath = resolve(`test-results/native-export-${Date.now()}.pdf`);
  const pdfModule = (await readdir('dist/assets')).find(filename => /^pdf-.*\.js$/.test(filename));
  assert.ok(pdfModule, 'The bundled PDF renderer was not found');
  await page.evaluate(async ({ moduleName, cv, path }) => {
    const { renderPDF } = await import(`/assets/${moduleName}`);
    const blob = await renderPDF(cv);
    await window.__TAURI_INTERNALS__.invoke('write_pdf', { path, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  }, { moduleName: pdfModule, cv: document, path: pdfPath });
  assert.equal((await readFile(pdfPath)).subarray(0, 5).toString(), '%PDF-');
  await page.getByRole('button', { name: 'Back to CVs' }).click();
  await page.getByRole('button', { name: 'Settings & connections' }).click();
  await page.getByRole('heading', { name: 'Workspace settings' }).waitFor();
  const settings = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_settings'));
  assert.ok(settings === null || typeof settings === 'object');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.screenshot({ path: 'test-results/native-workspace.png' });
  assert.deepEqual(errors, []);
  console.log('Native smoke passed: packaged UI, Rust IPC, SQLite save/reload, bundled PDF generation/native write, and settings. Native file-picker interaction requires a manual check.');
} catch (error) {
  console.error('Desktop errors:', errors);
  console.error('Visible alerts:', await page.getByRole('alert').allTextContents());
  await page.screenshot({ path: 'test-results/native-failure.png' });
  throw error;
} finally {
  if (templateId) await page.evaluate(id => window.__TAURI_INTERNALS__.invoke('delete_template', { id }), templateId);
  if (createdId) await page.evaluate(id => window.__TAURI_INTERNALS__.invoke('delete_cv', { id }), createdId);
  await browser.close();
}
