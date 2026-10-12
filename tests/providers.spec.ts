import { expect, test } from '@playwright/test';
import catalog from '../src/provider-catalog.json' with { type: 'json' };

test('provider picker replaces executable fields in browser preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings & connections' }).click();
  for (const provider of catalog) await expect(page.getByRole('button', { name: new RegExp(`${provider.name}.*Set up & connect`) })).toBeDisabled();
  await expect(page.getByText('Browser preview does not launch local agents.', { exact: false })).toBeVisible();
  await expect(page.getByLabel('API base URL')).toBeHidden();
  await expect(page.getByLabel('Executable (absolute path recommended)')).toHaveCount(0);
  await page.getByText('Advanced connections · custom executables', { exact: true }).click();
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await expect(page.getByLabel('Executable (absolute path recommended)')).toBeVisible();
  await page.screenshot({ path: 'test-results/provider-picker.png', fullPage: true });
});

test('desktop provider workflow discovers auth, verifies readiness, cancels and connects MCP', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ providers }) => {
    let saved: unknown = null;
    let rejectPending: ((reason: string) => void) | undefined;
    const requests: { command: string; args: Record<string, unknown> }[] = [];
    Object.assign(window, {
      isTauri: true,
      providerRequests: requests,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          requests.push({ command, args });
          if (command === 'list_cvs') return [];
          if (command === 'get_settings') return saved;
          if (command === 'save_settings') { saved = args.settings; return; }
          if (command === 'provider_status') return { nodeAvailable: true, providers: providers.map(provider => ({ id: provider.id, installed: provider.id !== 'claude' })) };
          if (command === 'install_provider') return;
          if (command === 'provider_connection') { const provider = providers.find(item => item.id === args.providerId)!; return { id: `provider-${provider.id}`, name: provider.name, protocol: provider.protocol, command: 'test-agent', args: [] }; }
          if (command === 'cancel_connection') { rejectPending?.('Connection cancelled.'); return; }
          if (command === 'run_connection') {
            if (args.action === 'test') return args.id === 'provider-mcp-remote' ? { tools: [{ name: 'read_profile' }] } : { authMethods: [{ id: 'browser', name: 'Sign in with test account' }, { id: 'terminal', name: 'Login in terminal', type: 'terminal' }], agentCapabilities: { auth: { logout: {} } } };
            if (args.action === 'authenticate' && (args.arguments as { methodId: string }).methodId === 'terminal') return new Promise((_, reject) => { rejectPending = reject; });
            if (args.action === 'authenticate' || args.action === 'check') return { ready: true };
            if (args.action === 'logout') return { signedOut: true };
            if (args.action === 'prompt') return { text: 'Keep your CV concise.' };
            if (args.action === 'call') return { content: [{ type: 'text', text: 'Tool response' }] };
          }
          if (command.startsWith('plugin:')) return 1;
          throw new Error(`Unexpected command: ${command}`);
        },
      },
    });
  }, { providers: catalog });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings & connections' }).click();
  await page.getByRole('button', { name: /^C Codex / }).click();
  await expect(page.getByRole('button', { name: /Sign in with test account/ })).toBeVisible();
  await expect(page.locator('.provider-progress')).not.toContainText('Ready');
  await page.getByRole('button', { name: /Sign in with test account/ }).click();
  await expect(page.locator('.provider-progress')).toContainText('Ready · agent session verified');
  await page.getByLabel('Message to assistant').fill('Help with my CV');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.locator('.provider-detail .connection-output')).toContainText('Keep your CV concise.');
  await page.getByRole('button', { name: /Login in terminal/ }).click();
  await page.getByRole('button', { name: 'Cancel connection' }).click();
  await expect(page.locator('.provider-progress')).toContainText('Connection cancelled');
  await page.getByRole('button', { name: /^C Claude / }).click();
  await expect(page.getByRole('alertdialog')).toContainText('@agentclientprotocol/claude-agent-acp@0.87.0');
  await page.getByRole('button', { name: 'Install & connect', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Claude' })).toBeVisible();
  await page.getByRole('button', { name: /^Remote MCP / }).click();
  await page.getByLabel('MCP server URL').fill('https://example.com/mcp');
  await page.getByRole('button', { name: 'Connect service', exact: true }).click();
  await expect(page.locator('.provider-progress')).toContainText('Connected · 1 tools available');
  await page.getByLabel('Available MCP tool', { exact: true }).selectOption('read_profile');
  await page.getByRole('button', { name: 'Run selected tool' }).click();
  await expect(page.locator('.provider-detail .connection-output')).toContainText('Tool response');
  expect(await page.evaluate(() => (window as unknown as { providerRequests: { command: string }[] }).providerRequests.filter(item => item.command === 'install_provider').length)).toBe(1);
  expect(errors).toEqual([]);
});
