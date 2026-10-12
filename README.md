# Folio

A local-first desktop CV workspace built with **Tauri 2, Rust, React, TypeScript, and SQLite**.

## Run

Windows prerequisites: Node.js 22.14+, Rust through rustup, Visual Studio C++ Build Tools with the Windows SDK, and the Microsoft Edge WebView2 runtime. `rust-toolchain.toml` pins Rust 1.99.0. No database server is required.

```powershell
npm ci --legacy-peer-deps
npm run desktop
```

For a browser-only preview, run `npm run dev` and open `http://127.0.0.1:1420`. Browser preview uses localStorage; AI, native credential storage, and process integrations require the desktop app. Browser and desktop data are separate. Transfer CVs using JSON backups.

```powershell
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npx playwright install chromium
npm run test:e2e
npm run desktop:build
```

The Windows NSIS installer is generated under `src-tauri/target/release/bundle/nsis/`. It is unsigned. The project currently targets Windows; macOS/Linux packaging, permissions, and native runtime behavior need platform testing before distribution. Set `CHROMIUM_EXECUTABLE` to an existing compatible Chromium executable to avoid downloading a test browser.

## Included workflows

- Create, edit, duplicate, search, and delete multiple CVs.
- Debounced autosave, serialized writes, and a save flush before navigation or desktop window closure. Failed saves remain visible and retryable.
- Personal details, summary, repeatable experience/education, skills, and languages.
- Eight designs with custom accent colors: Editorial, Modern, Classic, Executive, Studio, Nordic, Timeline, and Monogram. Template Studio previews each design in its curated color; switching designs in the editor preserves your chosen accent and all CV content.
- Selectable-text A4 PDF export with automatic pagination, embedded Latin/extended-Latin fonts, and optional portraits. The live HTML preview is a content overview; final PDF typography and pagination differ. Other writing systems require additional PDF font support.
- JSON backup/import. Backups include portraits and personal information.
- Eight-question guided interview, typed answers, spoken question playback using installed system voices, and recorded speech transcription through a configured provider.
- AI-assisted structuring of interview notes and summary rewriting. Suggestions must be reviewed and explicitly applied. Interview progress itself is session-only; accepted answers are saved in the CV.
- Camera capture or JPEG/PNG/WebP upload, resizing, and optional AI outfit editing with original-versus-result review. The original portrait is retained until the generated result is accepted. Accepted portraits are saved with the CV.
- Configurable stdio MCP tool connections and ACP agent connections.

## Storage

SQLite fits this single-user desktop app: offline operation, transactional updates, and no server to install or maintain. PostgreSQL becomes useful if a future version adds a hosted account service and cross-device collaboration.

The Rust backend creates `folio.sqlite3` in Tauri's application data directory, normally `%APPDATA%/com.folio.cv/` on Windows. SQLite WAL mode is enabled. CVs and settings are stored as versioned application documents; schema initialization uses `PRAGMA user_version=2`. API keys are stored separately in the OS credential manager and scoped to the configured provider URL.

The SQLite file is **not encrypted**. Use operating-system disk encryption for device-level protection. For a full offline database backup, close the app before copying the database; JSON export is the supported per-CV backup workflow.

## Configure AI

Open **Settings & connections → Advanced API settings**, enter your provider's API base URL, API key if needed, and model IDs for the features you want. No provider or paid account is configured by default. Remote URLs require HTTPS; localhost services may use HTTP.

The adapter supports these JSON/multipart API contracts:

| Feature | Request | Expected response |
| --- | --- | --- |
| Summary and CV drafting | `POST {base}/chat/completions`, JSON with `model` and `messages` | `choices[0].message.content` |
| Portrait editing | `POST {base}/images/edits`, multipart `model`, `prompt`, `image` | `data[0].b64_json`, PNG/JPEG/WebP |
| Voice transcription | `POST {base}/audio/transcriptions`, multipart `model`, `file` | `text` |

Providers that use other request schemas, require additional image parameters, or return only image URLs need an adapter adjustment. Models must support the corresponding feature. The app sends provider requests from Rust and keeps API keys out of the webview. Saving a blank key keeps the existing key; “Remove saved API key” deletes the credential for the saved provider URL. Change and save provider settings before removing that provider's key.

No CV or portrait is automatically uploaded. The interview and portrait panels require explicit permission to send data. Recorded audio is held in memory, uploaded when recording stops, and not saved in the database. Keep answers short. Camera/microphone access also requires OS/WebView permission. Speech playback depends on installed system voices.

## MCP and ACP

The interview now has an **Interview assistant** selector. In the desktop app it initially selects the first configured ACP agent when one exists. Allow sharing interview messages before sending. The selected agent replies to each message and decides whether it actually answers the current question; greetings and requests for clarification do not advance the form or become CV fields. The same selection handles summary and structured-draft suggestions. The guided-form option remains offline and saves answers directly. Voice transcription still uses the separately configured speech API. Changing settings refreshes available agents and resets sharing consent. Agent requests include the current question and recent conversation, not photos; malformed or empty responses leave the CV and typed message unchanged.

Open **Settings & connections** and choose **Codex, Claude, Gemini, GitHub Copilot, OpenCode, or Remote MCP**. No executable paths are needed for these providers. The first use asks permission to install a pinned adapter and its dependencies from npm into Folio's application-data directory. Node.js 22+ with npm is required; Folio does not install Node or sign into accounts automatically. Installation scripts and agents run with your OS account permissions, so review the package and trust notice before accepting.

For ACP, **Connect** discovers the installed agent's actual authentication methods. Choose a method to launch its browser flow or, on Windows, its interactive login terminal. Folio only shows **Ready** after the agent successfully creates a session. **Verify existing login** checks credentials already managed by the agent. **Cancel connection** stops a pending connection or sign-in; close the login terminal to cancel there. Provider sign-out is offered only when the agent advertises it and may also sign out the provider's own CLI. Availability, subscriptions, and API billing are controlled by each provider. Agent credentials are not stored in Folio's SQLite settings.

For **Remote MCP**, enter the service's HTTPS MCP endpoint, then choose **Connect service**. The pinned `mcp-remote` bridge handles HTTP/SSE and browser OAuth for compatible servers. It manages tokens in its own local credential cache, not Folio's OS API-key store. Tokens must not be pasted into endpoint URLs. Servers requiring static client registration, custom headers, or nonstandard authentication may need advanced configuration; there is no universal MCP account login. Connecting discovers tools but does not call them automatically.

**Advanced API settings** still configures the separate text, portrait, and transcription APIs. Signing into an ACP agent does not configure these APIs. **Advanced connections** retains custom stdio executables and JSON arguments for already-installed agents/servers. Custom executable entries are not automatically installed.

Example arguments for an already-installed Node server:

```json
["C:\\tools\\my-mcp-server\\dist\\index.js", "--stdio"]
```

MCP supports the initialization handshake, paginated tool discovery, and explicit tool calls. The client advertises `2025-06-18` and accepts the compatible initialized protocol versions listed in `protocol.rs`. Remote transport and OAuth are delegated to the optional bridge. MCP resources, prompts, sampling, and elicitation are not implemented.

ACP supports protocol version 1 initialization, advertised agent/terminal authentication, capability-gated logout, new sessions, text prompts, and collection of agent message updates. Each action starts a fresh process/session; responses appear when the action finishes. Persistent sessions, agent filesystem/terminal tool capabilities, and permission approval dialogs are not implemented. ACP tool permission requests are declined. Login terminals are a separate, user-initiated capability and are currently Windows-only. Unrecognized authentication types are not executed.

Both integrations are **clients**, not a Zed extension or a server exposing the CV database. Connection results are displayed for review and do not automatically change CVs. Requests time out after two minutes (six minutes for authentication/MCP connection) and have output-size limits. Provider installation has a ten-minute limit. The direct child process is stopped after the action; cancellation drops it. Descendant process cleanup is not guaranteed for third-party launchers.

### Selecting an assistant model

Interview conversations, progress, and unsent message drafts autosave per CV in the existing local storage (SQLite on desktop). Switching tabs or reopening a CV restores them. Starting another interview keeps earlier history. JSON backups and duplicated CVs include history; PDFs do not. Deleting a CV also deletes its stored chat. Only the recent twelve turns are sent as conversational context, alongside the current resume text, after sharing permission is granted again. Chats lost before this feature cannot be recovered.

The interview includes a fresh text snapshot of the currently open CV with each approved message, alongside recent conversation. This includes contact details, profile, experience, education, skills, and languages, but excludes photos, layout settings, and other CVs. Questions about the resume do not overwrite an interview field. Sharing consent appears above the message box; model options and additional writing tools are collapsed by default.

In the interview, or after connecting an assistant in Settings, click **Refresh models**, then choose **Assistant model**. Folio saves the choice per ACP connection and applies it before every future prompt, including interview replies and CV drafting. Reconnecting keeps the choice. **Agent default** clears the override; it does not repair an unsupported model in the agent's own configuration. MCP tools do not expose a standard assistant model selector.

Discovery supports ACP model config options (including grouped choices) and legacy session models. Lists come from the agent and may be cached; they do not guarantee access with your account. If Codex rejects a model with your ChatGPT login, choose another model reported by your agent. Missing saved models fail before sending the prompt rather than silently changing models. Agents without model discovery must be configured externally. Codex overrides are scoped to the launched process, not your global configuration. Refreshing starts a local agent session but sends no CV text. See [ACP session configuration](https://agentclientprotocol.com/protocol/v1/session-config-options).

Provider versions and launch flags are recorded in `src/provider-catalog.json`, based on the [ACP registry](https://github.com/agentclientprotocol/registry) and [mcp-remote](https://github.com/geelen/mcp-remote). Login handling follows [ACP authentication](https://agentclientprotocol.com/protocol/v1/authentication). Credentials and account behavior remain provider-owned; see [OpenAI authentication](https://developers.openai.com/codex/auth/), [Claude adapter](https://github.com/agentclientprotocol/claude-agent-acp), and [Gemini authentication](https://geminicli.com/docs/get-started/authentication/).

Installed agents/servers execute with your OS account's permissions, inherit your environment, and are not sandboxed by this app. Their working directory is a dedicated `agent-workspace` directory, but that is not filesystem isolation. Only configure trusted executables. Live interoperability with your selected external tools and AI services requires testing with those tools and credentials.

## Code map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Workspace, library, editor, autosave queue |
| `src/model.ts` | CV schema, validation, interview mapping, AI draft validation |
| `src/storage.ts` | Desktop/browser persistence and exports |
| `src/Preview.tsx`, `src/pdf.ts` | HTML preview and PDFKit generation |
| `src/Interview.tsx`, `src/Portrait.tsx` | Interview, recording, camera, AI review |
| `src/Settings.tsx` | Provider and connection management |
| `src-tauri/src/db.rs` | SQLite repository |
| `src-tauri/src/ai.rs` | Provider requests and credential access |
| `src-tauri/src/protocol.rs` | Bounded stdio JSON-RPC clients |
| `tests/workspace.spec.ts` | Browser workflow and PDF checks |

Protocol/configuration references: [Tauri capabilities](https://v2.tauri.app/security/capabilities/), [Tauri configuration](https://v2.tauri.app/reference/config/), [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18), [ACP protocol](https://agentclientprotocol.com/protocol/overview).

The desktop CSP disallows JavaScript evaluation and WebAssembly compilation. Browser end-to-end tests run against the production bundle with the same CSP.

## Template Editor Studio

### Resume language and appearance

Use **Resume language** above the editor tabs to choose English, German, Turkish, French, Spanish, Italian, Portuguese, Dutch, or Polish. The choice is saved with each CV and localizes built-in section headings in preview and PDF export. AI interview replies and writing suggestions request that language. Existing resume text and custom Studio headings are not automatically translated; edit them or review AI suggestions. Use **App language** in the top bar to switch the interface and guided questions between English, Spanish, German, and Turkish. This device preference persists independently of resume language, updates accessible labels and read-aloud questions, and leaves saved CV text and chat replies unchanged. External provider responses and technical diagnostics remain in their original language. All empty-resume placeholders follow the resume language. These languages use the bundled Latin/extended-Latin PDF fonts; other writing systems are not offered by this selector.

Use **Appearance** in the top bar for Light, Dark, or System. The preference stays on this device, follows OS changes in System mode, and does not change resume paper, template colors, or PDF exports.

Open **Template studio → Open Template Editor**, or open a CV's **Design** tab. Start from any of the eight layouts and customize bundled sans/serif typography, colors, type sizes, page margins, section spacing, A4/Letter paper, portrait shape, and contact visibility. Rename, reorder, or hide sections without deleting their content.

Use **Save template** to keep a reusable design in the local SQLite database (local storage in browser preview). **Browse saved templates** loads, duplicates, or removes saved designs. **Apply to CV** saves an independent design snapshot in the current CV; later template edits or deletion do not change existing CVs. Unsaved edits prompt before closing the studio. Templates contain design settings, not personal CV text or photos. **Preview PDF** checks final pagination; the live preview is a content overview.

## Verification

Validation includes production frontend and Windows release builds, twenty TypeScript unit tests, ten Rust tests, and seventeen browser workflows. Browser checks cover persistence, duplication/deletion, interview mapping, mocked ACP interview replies, model selection and failure recovery, JSON backups, all eight PDF templates, multipage output, extended-Latin names, portrait embedding, template selection and preservation of content, responsive layout, and simulated-camera shutdown. Rust mock peers verify modern and legacy model selection before prompts and rejection of unavailable models.

`tests/native-smoke.mjs` validates the packaged WebView2 app, Rust IPC, SQLite save/reload, settings, and the bundled PDF renderer plus native file writing. It expects the release executable running with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`, and removes its temporary CV afterwards. Only enable that debugging endpoint for local testing; close the test app afterwards. Native file-picker interaction remains a manual check.

Real AI provider calls, physical camera/microphone behavior, and third-party agents require your own configured services and devices. Protocol tests use local mock peers. The installer has been built but has not been installed or code-signed.
