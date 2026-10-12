import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newCV } from './model';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn() }));
import { deleteCV, getSettings, listCVs, saveCV, saveSettings } from './storage';

describe('browser preview persistence', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  });
  it('saves multiple documents, replaces by ID, and deletes only the selected CV', async () => {
    const first = newCV(); const second = newCV();
    await saveCV(first); await saveCV(second); await saveCV({ ...first, name: 'Updated' });
    expect(await listCVs()).toHaveLength(2);
    expect((await listCVs()).find(cv => cv.id === first.id)?.name).toBe('Updated');
    await deleteCV(first.id);
    expect((await listCVs()).map(cv => cv.id)).toEqual([second.id]);
  });
  it('does not silently discard corrupt storage', async () => {
    localStorage.setItem('folio.cvs.v1', '[{}]');
    await expect(listCVs()).rejects.toThrow();
    await expect(saveCV(newCV())).rejects.toThrow();
    expect(localStorage.getItem('folio.cvs.v1')).toBe('[{}]');
  });
  it('never persists the API key in browser storage', async () => {
    const settings = await getSettings();
    await saveSettings(settings, 'secret-test-key');
    expect(localStorage.getItem('folio.settings.v1')).not.toContain('secret-test-key');
  });
  it('round trips chat, progress and drafts separately for each CV', async () => {
    const first = { ...newCV(), interview: { step: 1, draft: 'Unsent message', history: [{ question: 'Name?', answer: 'Burak', reply: 'Thanks!', assistant: 'Codex', createdAt: '2026-10-08T12:00:00Z' }] } };
    const second = newCV();
    await saveCV(first); await saveCV(second);
    const loaded = await listCVs();
    expect(loaded.find(cv => cv.id === first.id)?.interview).toEqual(first.interview);
    expect(loaded.find(cv => cv.id === second.id)?.interview).toBeUndefined();
    await expect(saveCV({ ...first, interview: { ...first.interview, step: -1 } })).rejects.toThrow('Invalid interview history');
    await deleteCV(first.id);
    expect(await listCVs()).toEqual([second]);
  });
});
