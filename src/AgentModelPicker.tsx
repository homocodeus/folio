import { useI18n } from './i18n';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Connection } from './model';

interface ModelCatalog { models: { id: string; name: string }[]; currentModel?: string }

export default function AgentModelPicker({ connection, disabled, onBusy, onSaved }: { connection: Connection; disabled?: boolean; onBusy: (busy: boolean) => void; onSaved?: (modelId: string) => void }) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function perform(action: () => Promise<void>) {
    setBusy(true); onBusy(true); setError('');
    try { await action(); } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); onBusy(false); }
  }
  return <div className="subtle-card"><label>{t("Assistant model")}<select aria-label={t("Assistant model")} value={connection.modelId ?? ''} disabled={disabled || busy} onChange={event => { const modelId = event.target.value; void perform(async () => { await invoke('set_connection_model', { id: connection.id, modelId }); onSaved?.(modelId); window.dispatchEvent(new Event('folio-settings-changed')); }); }}><option value="">{t("Agent default")}{catalog?.currentModel ? ` (${catalog.currentModel})` : ''}</option>{connection.modelId && !catalog?.models.some(model => model.id === connection.modelId) && <option value={connection.modelId}>{connection.modelId} {t("(saved; refresh to verify)")}</option>}{catalog?.models.map(model => <option key={model.id} value={model.id}>{model.name} · {model.id}</option>)}</select></label><button className="secondary" disabled={disabled || busy} onClick={() => void perform(async () => setCatalog(await invoke<ModelCatalog>('run_connection', { id: connection.id, action: 'models', prompt: '', toolName: '', arguments: {} })))}>{busy ? t("Working…") : t("Refresh models")}</button><p className="hint">{t("Models are reported by your agent and may be cached. Availability depends on your account. Your choice is saved for this assistant and used for future messages. Agent default uses its external configuration.")}</p>{catalog && !catalog.models.length && <p role="status">{t("This agent does not advertise selectable models. Configure its model in the provider’s own settings.")}</p>}{error && <p role="alert">{t(error)}</p>}</div>;
}
