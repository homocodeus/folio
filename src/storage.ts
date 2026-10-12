import { invoke, isTauri } from '@tauri-apps/api/core';
import { CV, SavedTemplate, Settings, defaultSettings, validateCV, validateSavedTemplate } from './model';

const key = 'folio.cvs.v1';
export const desktop = isTauri();
export async function listCVs(): Promise<CV[]> {
  const values: unknown[] = desktop ? await invoke('list_cvs') : JSON.parse(localStorage.getItem(key) || '[]');
  return values.map(validateCV).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}
export async function saveCV(cv: CV): Promise<void> {
  validateCV(cv);
  if (desktop) return invoke('save_cv', { cv });
  const cvs = await listCVs();
  localStorage.setItem(key, JSON.stringify([cv, ...cvs.filter(item => item.id !== cv.id)]));
}
export async function deleteCV(id: string): Promise<void> {
  if (desktop) return invoke('delete_cv', { id });
  localStorage.setItem(key, JSON.stringify((await listCVs()).filter(cv => cv.id !== id)));
}
export async function listTemplates(): Promise<SavedTemplate[]> {
  const values: unknown[] = desktop ? await invoke('list_templates') : JSON.parse(localStorage.getItem('folio.templates.v1') || '[]');
  if (!Array.isArray(values)) throw new Error('Saved template storage is invalid.');
  return values.map(validateSavedTemplate).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}
export async function saveTemplate(preset: SavedTemplate): Promise<void> {
  const valid = validateSavedTemplate(preset);
  if (desktop) return invoke('save_template', { preset: valid });
  const saved = await listTemplates();
  localStorage.setItem('folio.templates.v1', JSON.stringify([valid, ...saved.filter(item => item.id !== valid.id)]));
}
export async function deleteTemplate(id: string): Promise<void> {
  if (desktop) return invoke('delete_template', { id });
  localStorage.setItem('folio.templates.v1', JSON.stringify((await listTemplates()).filter(preset => preset.id !== id)));
}
export async function getSettings(): Promise<Settings> {
  const settings = desktop ? await invoke<Settings | null>('get_settings') : JSON.parse(localStorage.getItem('folio.settings.v1') || 'null');
  return settings || defaultSettings;
}
export async function saveSettings(settings: Settings, apiKey: string): Promise<void> {
  if (desktop) await invoke('save_settings', { settings, apiKey });
  else localStorage.setItem('folio.settings.v1', JSON.stringify(settings));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('folio-settings-changed'));
}
export async function aiText(prompt: string): Promise<string> {
  if (!desktop) throw new Error('AI connections are available in the desktop app. Run npm run desktop.');
  return invoke('ai_text', { prompt });
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function exportPDF(cv: CV) {
  const { renderPDF } = await import('./pdf');
  const blob = await renderPDF(cv);
  const filename = `${cv.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'My CV'}.pdf`;
  if (!desktop) { downloadBlob(blob, filename); return true; }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const path = await save({ defaultPath: filename, filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
  if (!path) return false;
  await invoke('write_pdf', { path, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  return true;
}
