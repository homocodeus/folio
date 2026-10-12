import { expect, test } from '@playwright/test';

test('interview sends messages to configured Codex and only saves accepted answers', async ({ page }) => {
  await page.addInitScript(() => {
    let cvs: Record<string, unknown>[] = JSON.parse(sessionStorage.getItem('test-cvs') || '[]');
    const prompts: string[] = [];
    let modelId = 'unsupported-model';
    Object.assign(window, {
      isTauri: true, interviewPrompts: prompts,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1, unregisterCallback: () => {},
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          if (command === 'list_cvs') return cvs;
          if (command === 'save_cv') { const cv = args.cv as Record<string, unknown>; cvs = [cv, ...cvs.filter(item => item.id !== cv.id)]; sessionStorage.setItem('test-cvs', JSON.stringify(cvs)); return; }
          if (command === 'get_settings') return { provider: { baseUrl: '', textModel: '', imageModel: '', speechModel: '' }, connections: [{ id: 'codex-connected', name: 'Codex', protocol: 'acp', command: 'test-agent', args: [], modelId }] };
          if (command === 'set_connection_model') { modelId = String(args.modelId); return; }
          if (command === 'run_connection') {
            if (args.action === 'models') return { models: [{ id: 'model-quality', name: 'Quality' }], currentModel: 'unsupported-model' };
            if (args.id !== 'codex-connected' || args.action !== 'prompt') throw new Error('Wrong assistant selected');
            if (modelId !== 'model-quality') throw new Error('Wrong model saved');
            const prompt = String(args.prompt); prompts.push(prompt);
            if (prompt.includes('"message":"can you see my resume"')) {
              if (!prompt.includes('"currentResume":{"name":"Burak"')) throw new Error('Current CV was not included');
              return { text: '{"reply":"Your current CV says Burak. We can build on that.","answer":null}' };
            }
            if (prompt.includes('"message":"hi"')) return { text: '{"reply":"Hello! I am Codex. What is your full name?","answer":null}' };
            if (prompt.includes('"message":"my name is Burak"')) return { text: '{"reply":"Nice to meet you, Burak.","answer":"Burak"}' };
            return { text: '' };
          }
          if (command.startsWith('plugin:')) return 1;
          throw new Error(`Unexpected command ${command}`);
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start with an interview' }).click();
  await expect(page.getByLabel('Interview assistant', { exact: true })).toHaveValue('codex-connected');
  await page.getByText('Model options · unsupported-model', { exact: true }).click();
  await expect(page.getByLabel('Assistant model', { exact: true })).toHaveValue('unsupported-model');
  await page.getByRole('button', { name: 'Refresh models', exact: true }).click();
  await page.getByLabel('Assistant model', { exact: true }).selectOption('model-quality');
  await expect(page.getByLabel('Assistant model', { exact: true })).toHaveValue('model-quality');
  await page.getByLabel('Your answer', { exact: true }).fill('hi');
  await expect(page.getByRole('button', { name: 'Use answer', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Allow sending interview messages/ }).check();
  await page.getByRole('button', { name: 'Use answer', exact: true }).click();
  await expect(page.locator('.chat-history')).toContainText('Hello! I am Codex.');
  await expect(page.locator('.interview-progress')).toContainText('0 / 8');
  await page.getByLabel('Your answer', { exact: true }).fill('my name is Burak');
  await page.getByRole('button', { name: 'Use answer', exact: true }).click();
  await expect(page.locator('.chat-history')).toContainText('Nice to meet you, Burak.');
  await expect(page.locator('.interview-progress')).toContainText('1 / 8');
  await page.getByLabel('Your answer', { exact: true }).fill('can you see my resume');
  await page.getByRole('button', { name: 'Use answer', exact: true }).click();
  await expect(page.locator('.chat-history')).toContainText('Your current CV says Burak');
  await expect(page.locator('.interview-progress')).toContainText('1 / 8');
  await page.getByLabel('Your answer', { exact: true }).fill('retry this');
  await page.getByRole('button', { name: 'Use answer', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('returned no text');
  await expect(page.getByLabel('Your answer', { exact: true })).toHaveValue('retry this');
  await expect(page.locator('.interview-progress')).toContainText('1 / 8');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Burak');
  await expect(page.getByLabel('Professional headline')).toHaveValue('');
  expect(await page.evaluate(() => (window as unknown as { interviewPrompts: string[] }).interviewPrompts.length)).toBe(4);
  await page.getByRole('button', { name: 'Interview', exact: true }).click();
  await expect(page.locator('.chat-history')).toContainText('Your current CV says Burak');
  await expect(page.getByLabel('Your answer', { exact: true })).toHaveValue('retry this');
  await expect(page.getByRole('button', { name: 'All changes saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Untitled CV', exact: true }).click();
  await page.getByRole('button', { name: 'Interview', exact: true }).click();
  await expect(page.locator('.chat-history')).toContainText('Hello! I am Codex.');
  await expect(page.locator('.chat-history')).toContainText('Your current CV says Burak');
  await expect(page.getByLabel('Your answer', { exact: true })).toHaveValue('retry this');
  await expect(page.locator('.interview-progress')).toContainText('1 / 8');
  await expect(page.getByRole('checkbox', { name: /Allow sending interview messages/ })).not.toBeChecked();
});
