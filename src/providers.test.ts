import { expect, it } from 'vitest';
import { remoteURL } from './ProviderConnections';
import catalog from './provider-catalog.json';

it('offers pinned provider adapters rather than arbitrary install commands', () => {
  expect(catalog.map(item => item.id)).toEqual(['codex', 'claude', 'gemini', 'copilot', 'opencode', 'mcp-remote']);
  expect(new Set(catalog.map(item => item.id)).size).toBe(catalog.length);
  for (const provider of catalog) {
    expect(provider.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(provider.package).not.toMatch(/\s/);
    expect(provider.args).toBeInstanceOf(Array);
  }
});

it('rejects secret-bearing or executable remote MCP URLs', () => {
  expect(remoteURL(' https://example.com/mcp ')).toBe('https://example.com/mcp');
  for (const value of ['javascript:alert(1)', 'file:///C:/secret', 'http://example.com', 'https://user:pass@example.com', 'https://example.com?token=secret', 'https://example.com#secret']) expect(() => remoteURL(value)).toThrow();
});
