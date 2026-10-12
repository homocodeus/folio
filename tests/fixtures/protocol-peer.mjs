import { createInterface } from 'node:readline';

const protocol = process.argv[2];
const mode = process.argv[3];
let initialized = false;
let sessionCreated = false;
let authenticated = false;
let selectedModel = 'model-fast';
const modelOptions = () => ({ configOptions: [{ id: 'model', category: 'model', type: 'select', currentValue: selectedModel, options: [{ value: 'model-fast', name: 'Fast' }, { group: 'more', name: 'More', options: [{ value: 'model-quality', name: 'Quality' }] }] }] });
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialize') {
    if (mode === 'error') return send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Expected test error' } });
    return result(message.id, { protocolVersion: protocol === 'mcp' ? '2025-06-18' : 1, capabilities: { tools: {} }, agentCapabilities: mode === 'auth-required' ? { auth: { logout: {} } } : {}, authMethods: [{ id: 'browser-login', name: 'Sign in with test provider' }, { id: 'unsupported', name: 'Unsupported auth', type: 'env' }] });
  }
  if (message.method === 'authenticate') {
    if (message.params.methodId !== 'browser-login') throw new Error('Unexpected authentication method');
    authenticated = true;
    return result(message.id, {});
  }
  if (message.method === 'logout') { authenticated = false; return result(message.id, {}); }
  if (message.method === 'notifications/initialized') initialized = true;
  if (message.method === 'tools/list') {
    if (!initialized) throw new Error('Client skipped initialization');
    return result(message.id, message.params.cursor ? { tools: [{ name: 'second', inputSchema: { type: 'object' } }] } : { tools: [{ name: 'echo', inputSchema: { type: 'object' } }], nextCursor: 'next-page' });
  }
  if (message.method === 'tools/call') {
    if (!initialized) throw new Error('Client skipped initialization');
    return result(message.id, { content: [{ type: 'text', text: JSON.stringify(message.params.arguments) }] });
  }
  if (message.method === 'session/new') {
    if (mode === 'auth-required' && !authenticated) return send({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: 'Authentication required' } });
    sessionCreated = true; return result(message.id, { sessionId: 'test-session', ...(mode === 'models' ? modelOptions() : mode === 'legacy-models' ? { models: { currentModelId: selectedModel, availableModels: [{ modelId: 'model-quality', name: 'Quality' }] } } : {}) });
  }
  if (message.method === 'session/set_config_option' || message.method === 'session/set_model') {
    if (!sessionCreated || message.params.sessionId !== 'test-session') throw new Error('Invalid session');
    selectedModel = message.params.value ?? message.params.modelId;
    return result(message.id, message.method === 'session/set_model' ? {} : modelOptions());
  }
  if (message.method === 'session/prompt') {
    if (['models', 'legacy-models'].includes(mode) && selectedModel !== 'model-quality') throw new Error('Selected model was not applied before prompting');
    if (!sessionCreated || message.params.sessionId !== 'test-session') throw new Error('Client skipped session creation');
    send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'test-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello from the test agent.' } } } });
    send({ jsonrpc: '2.0', id: 999, method: 'session/request_permission', params: { sessionId: 'test-session', options: [{ optionId: 'allow', kind: 'allow_once', name: 'Allow' }], toolCall: { toolCallId: 'test', title: 'Test permission' } } });
    globalThis.promptId = message.id;
  }
  if (message.id === 999 && message.result) {
    if (message.result.outcome.outcome !== 'cancelled') throw new Error('Permission should not be auto-approved');
    result(globalThis.promptId, { stopReason: 'end_turn' });
  }
});
