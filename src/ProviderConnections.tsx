import { useI18n } from './i18n';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, Check, Download, LoaderCircle, Plug, ShieldCheck, X } from 'lucide-react';
import { Connection } from './model';
import { desktop } from './storage';
import catalog from './provider-catalog.json';
import AgentModelPicker from './AgentModelPicker';
import './providers.css';

interface AuthMethod { id: string; name: string; description?: string; type?: string }
interface AgentInfo { authMethods?: AuthMethod[]; agentCapabilities?: { auth?: { logout?: object } }; tools?: { name: string; description?: string }[] }
interface InstallationStatus { nodeAvailable: boolean; providers: { id: string; installed: boolean }[] }
type Provider = typeof catalog[number];

export function remoteURL(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Enter an HTTPS MCP server URL without tokens, credentials, query parameters, or fragments.');
  return url.href;
}

export default function ProviderConnections({ connections, upsert, onBusy, onError, onModelSaved }: { connections: Connection[]; upsert: (connection: Connection) => Promise<void>; onBusy: (busy: boolean) => void; onError: (error: unknown) => void; onModelSaved: (id: string, modelId: string) => void }) {
  const { t } = useI18n();
  const [installation, setInstallation] = useState<InstallationStatus | null>(null);
  const [selected, setSelected] = useState<Provider | null>(null);
  const [confirm, setConfirm] = useState<Provider | null>(null);
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [working, setBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const busy = working || modelBusy;
  const [installing, setInstalling] = useState(false);
  const [status, setStatus] = useState('Choose your assistant. No executable paths or JSON required.');
  const [ready, setReady] = useState(false);
  const [statusValues, setStatusValues] = useState<Record<string, string | number>>({});
  const [serverUrl, setServerUrl] = useState(() => connections.find(item => item.providerId === 'mcp-remote')?.serverUrl ?? '');
  const [prompt, setPrompt] = useState('');
  const [tool, setTool] = useState('');
  const [toolArgs, setToolArgs] = useState('{}');
  const [output, setOutput] = useState('');
  async function refresh() { if (desktop) setInstallation(await invoke<InstallationStatus>('provider_status')); }
  useEffect(() => { void refresh().catch(onError); }, []);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  async function run(connection: Connection, action: string, argumentsValue: object = {}) {
    return invoke<AgentInfo & { ready?: boolean; text?: string }>('run_connection', { id: connection.id, action, arguments: argumentsValue, prompt, toolName: tool });
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); } catch (error) { setReady(false); setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function connect(provider: Provider, install = false) {
    await perform(async () => {
      setSelected(provider); setInfo(null); setReady(false); setOutput(''); setTool(''); setActiveConnection(null);
      const url = provider.id === 'mcp-remote' ? remoteURL(serverUrl) : '';
      if (install) {
        setInstalling(true); setStatus('Installing {name} locally. This may take a few minutes…'); setStatusValues({ name: provider.name });
        try { await invoke('install_provider', { providerId: provider.id }); await refresh(); } finally { setInstalling(false); }
      }
      setStatus(provider.protocol === 'mcp' ? 'Connecting to your MCP service. Complete browser authorization if it opens…' : 'Discovering available sign-in methods…');
      const config = await invoke<Connection>('provider_connection', { providerId: provider.id, remoteUrl: url });
      const existing = connections.find(item => item.providerId === provider.id);
      const connection: Connection = { ...config, id: existing?.id ?? config.id, modelId: existing?.modelId, providerId: provider.id, ...(url ? { serverUrl: url } : {}) };
      await upsert(connection); setActiveConnection(connection);
      const result = await run(connection, 'test'); setInfo(result);
      if (provider.protocol === 'mcp') { setReady(true); setStatus('Connected · {count} tools available'); setStatusValues({ count: result.tools?.length ?? 0 }); }
      else setStatus('Choose a sign-in method below, or verify an existing login.');
    });
  }
  function choose(provider: Provider) {
    setConfirm(null);
    setSelected(provider); setInfo(null); setReady(false); setActiveConnection(null); setOutput('');
    if (provider.id === 'mcp-remote') { try { remoteURL(serverUrl); } catch { setStatus('Enter your service’s HTTPS MCP endpoint below, then choose Connect service.'); return; } }
    if (!installation?.providers.find(item => item.id === provider.id)?.installed) setConfirm(provider);
    else void connect(provider);
  }
  async function authenticate(method?: AuthMethod) {
    if (!activeConnection) return;
    await perform(async () => {
      setReady(false);
      setStatus(method?.type === 'terminal' ? 'Complete sign-in in the provider’s login window. Close that window to cancel.' : method ? 'Complete sign-in in your browser if prompted. Waiting for the provider…' : 'Checking whether this agent can open a session…');
      const response = await run(activeConnection, method ? 'authenticate' : 'check', method ? { methodId: method.id } : {});
      setReady(response.ready === true); setStatus(response.ready ? 'Ready · agent session verified' : 'The agent did not confirm readiness. Try connecting again.');
    });
  }
  return <section className="provider-hub" aria-labelledby="providers-heading"><div className="provider-hub-heading"><div><span className="eyebrow">{t("YOUR ASSISTANTS, ONE WORKSPACE")}</span><h3 id="providers-heading">{t("Connect an AI assistant")}</h3></div><span className="provider-local"><ShieldCheck size={14}/>{t("Provider-managed login")}</span></div><p className="muted">{t("Choose an assistant, install its adapter once, then sign in. Some providers open a browser directly; others open an interactive login window. Account access and billing remain with the provider.")}</p>
    {!desktop && <p className="notice">{t("Open the Folio desktop app to install providers and sign in. Browser preview does not launch local agents.")}</p>}
    {desktop && installation && !installation.nodeAvailable && <p className="notice">{t("Install Node.js 22 or newer with npm, then restart Folio. Provider setup will handle the rest.")}</p>}
    <div className="provider-grid">{catalog.map(provider => <button key={provider.id} className={`provider-tile ${selected?.id === provider.id ? 'chosen' : ''}`} disabled={!desktop || busy || !installation} onClick={() => choose(provider)}><span className={`provider-symbol provider-${provider.id}`}>{provider.id === 'mcp-remote' ? <Plug size={24}/> : provider.name.slice(0, 1)}</span><strong>{provider.name}</strong><small>{t(provider.description)}</small><span className="provider-connect">{installation?.providers.find(item => item.id === provider.id)?.installed ? t("Connect") : t("Set up & connect")}<ArrowRight size={14}/></span></button>)}</div>
    <div className="provider-progress" role="status">{busy ? <LoaderCircle size={16} className="spin"/> : ready ? <Check size={16}/> : <Plug size={16}/>}<span>{t(status, statusValues)}</span>{busy && !installing && activeConnection && <button className="secondary" onClick={() => invoke('cancel_connection', { id: activeConnection.id }).catch(onError)}>{t("Cancel connection")}</button>}</div>
    {selected?.id === 'mcp-remote' && <div className="provider-detail"><h4>{t("Connect your MCP service")}</h4><label>{t("MCP server URL")}<input type="url" value={serverUrl} placeholder="https://your-service.example/mcp" disabled={busy} onChange={event => { setServerUrl(event.target.value); setReady(false); setInfo(null); setActiveConnection(null); }}/></label><p className="hint">{t("Use the endpoint published by your service, not its website login page. Compatible OAuth services open their own authorization screen. Private servers may need additional setup.")}</p><button className="primary" disabled={!desktop || busy} onClick={() => choose(selected)}>{t("Connect service")}<ArrowRight size={15}/></button></div>}
    {selected && info && selected.protocol === 'acp' && <div className="provider-detail"><h4>{t("Sign in to")} {selected.name}</h4><div className="provider-auth-methods">{(info.authMethods ?? []).map(method => <button className="secondary" key={method.id} disabled={busy || !['agent', 'terminal'].includes(method.type ?? 'agent')} onClick={() => authenticate(method)}><span><strong>{method.name}</strong><small>{method.description || (method.type === 'terminal' ? t("Opens an interactive login window") : t("Provider-managed sign-in"))}</small></span><ArrowRight size={16}/></button>)}</div>{!info.authMethods?.length && <p>{t("This agent did not advertise a login method. Verify an existing login or use its own account setup.")}</p>}<button className="text-button" disabled={busy} onClick={() => authenticate()}>{t("Verify existing login")}</button>{info.agentCapabilities?.auth?.logout && <button className="text-button danger" disabled={busy} onClick={() => perform(async () => { await run(activeConnection!, 'logout'); setReady(false); setStatus('Signed out through the provider. This may also sign out its CLI on this device.'); })}>{t("Sign out of provider")}</button>}</div>}
    {activeConnection && info && <div className="provider-detail"><h4>{activeConnection.protocol === 'acp' ? t("Ask your assistant") : t("Available tools")}</h4>{activeConnection.protocol === 'acp' ? <><label>{t("Message to assistant")}<textarea value={prompt} disabled={busy} onChange={event => setPrompt(event.target.value)} placeholder={t("Ask for CV advice. Only include information you want to share.")}/></label><button className="primary" disabled={busy || !prompt.trim()} onClick={() => perform(async () => { setStatus('Waiting for the assistant…'); const result = await run(activeConnection, 'prompt'); setOutput(result.text ?? JSON.stringify(result, null, 2)); setReady(true); setStatus('Response received'); })}>{t("Send message")}<ArrowRight size={15}/></button></> : <><label>{t("Available MCP tool")}<select aria-label={t("Available MCP tool")} value={tool} disabled={busy} onChange={event => setTool(event.target.value)}><option value="">{t("Choose a tool")}</option>{(info.tools ?? []).map(item => <option value={item.name} key={item.name}>{item.name}</option>)}</select></label><label>{t("Tool arguments (JSON object)")}<textarea value={toolArgs} disabled={busy} onChange={event => setToolArgs(event.target.value)}/></label><button className="secondary" disabled={busy || !tool} onClick={() => perform(async () => { const args = JSON.parse(toolArgs); if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('Tool arguments must be a JSON object.'); setOutput(JSON.stringify(await run(activeConnection, 'call', args), null, 2)); setStatus('Tool finished'); })}>{t("Run selected tool")}</button></>}{output && <pre className="connection-output">{output}</pre>}<p className="hint">{t("CVs are not sent automatically. Removing a connection does not revoke the provider’s credentials. Provider login does not configure portrait generation or voice transcription.")}</p></div>}
    {confirm && <div className="provider-consent" role="alertdialog" aria-labelledby="install-provider-title"><div className="button-row"><Download size={20}/><h4 id="install-provider-title">{t("Install")} {confirm.name} {t("adapter?")}</h4></div><p>{t("This downloads and runs")} <code>{confirm.package}@{confirm.version}</code> {t("from npm, including its dependencies and installation scripts. It runs with your OS account’s permissions and is not sandboxed by Folio. Only continue if you trust this software.")}</p><p>{t("Node.js 22+ and an internet connection are required. Tokens are managed by the provider or MCP bridge, not stored in CVs. The MCP bridge keeps its own local credential cache.")}</p><div className="button-row"><button className="secondary" onClick={() => setConfirm(null)}><X size={14}/>{t("Not now")}</button><button className="primary" onClick={() => { const provider = confirm; setConfirm(null); void connect(provider, true); }}>{t("Install & connect")}<ArrowRight size={15}/></button></div></div>}
    {activeConnection?.protocol === 'acp' && <AgentModelPicker key={activeConnection.id} connection={activeConnection} disabled={working} onBusy={setModelBusy} onSaved={modelId => { setActiveConnection({ ...activeConnection, modelId }); onModelSaved(activeConnection.id, modelId); }}/ >}
  </section>;
}
