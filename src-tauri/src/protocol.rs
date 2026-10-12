use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};

#[derive(Clone, Deserialize, Serialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub protocol: String,
    pub command: String,
    pub args: Vec<String>,
    #[serde(default, rename = "modelId", skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(
        default,
        rename = "providerId",
        skip_serializing_if = "Option::is_none"
    )]
    pub provider_id: Option<String>,
    #[serde(
        default,
        rename = "terminalLogin",
        skip_serializing_if = "Option::is_none"
    )]
    pub terminal_login: Option<TerminalLogin>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalLogin {
    pub method_id: String,
    pub args: Vec<String>,
}

struct Rpc {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    next_id: u64,
    updates: Vec<Value>,
    total_bytes: usize,
}

impl Rpc {
    fn spawn(config: &ConnectionConfig, cwd: &Path) -> Result<Self, String> {
        if config.command.trim().is_empty() {
            return Err("Set an executable path for this connection.".into());
        }
        let mut command = Command::new(&config.command);
        if config.provider_id.as_deref() == Some("codex") {
            if let Some(model) = config.model_id.as_deref().filter(|value| !value.is_empty()) {
                let mut overrides: Value = match std::env::var("CODEX_CONFIG") {
                    Ok(value) => serde_json::from_str(&value)
                        .map_err(|_| "CODEX_CONFIG is not valid JSON")?,
                    Err(_) => json!({}),
                };
                if !overrides.is_object() {
                    return Err("CODEX_CONFIG must be a JSON object".into());
                }
                overrides["model"] = json!(model);
                command.env("CODEX_CONFIG", overrides.to_string());
            }
        }
        command
            .args(&config.args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        let mut child = command
            .spawn()
            .map_err(|error| format!("Could not launch {}: {error}", config.name))?;
        let input = child.stdin.take().ok_or("Agent stdin was not available")?;
        let output = BufReader::new(
            child
                .stdout
                .take()
                .ok_or("Agent stdout was not available")?,
        );
        Ok(Self {
            child,
            input,
            output,
            next_id: 0,
            updates: Vec::new(),
            total_bytes: 0,
        })
    }

    async fn send(&mut self, value: Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(&value).map_err(|error| error.to_string())?;
        bytes.push(b'\n');
        self.input
            .write_all(&bytes)
            .await
            .map_err(|error| error.to_string())?;
        self.input.flush().await.map_err(|error| error.to_string())
    }

    async fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        self.send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
            .await?;
        loop {
            let mut bytes = Vec::new();
            let length = (&mut self.output)
                .take(2 * 1024 * 1024 + 1)
                .read_until(b'\n', &mut bytes)
                .await
                .map_err(|error| error.to_string())?;
            if length == 0 {
                return Err("The agent closed its connection before responding.".into());
            }
            self.total_bytes += length;
            if length > 2 * 1024 * 1024 || self.total_bytes > 16 * 1024 * 1024 {
                return Err("Agent output exceeded the size limit.".into());
            }
            let message: Value = serde_json::from_slice(&bytes).map_err(|_| {
                "Agent stdout must contain newline-delimited JSON-RPC messages only."
            })?;
            if message.get("method").is_some() {
                if let Some(request_id) = message.get("id") {
                    let reply = if message["method"] == "session/request_permission" {
                        json!({"jsonrpc":"2.0","id":request_id,"result":{"outcome":{"outcome":"cancelled"}}})
                    } else {
                        json!({"jsonrpc":"2.0","id":request_id,"error":{"code":-32601,"message":"Client capability not supported"}})
                    };
                    self.send(reply).await?;
                } else if message["method"] == "session/update" {
                    self.updates.push(message["params"].clone());
                }
            } else if message["id"] == id {
                if let Some(error) = message.get("error") {
                    return Err(format!("Agent error: {error}"));
                }
                return message
                    .get("result")
                    .cloned()
                    .ok_or("Agent response did not contain a result.".into());
            }
        }
    }

    async fn exchange(
        &mut self,
        config: &ConnectionConfig,
        action: &str,
        tool: &str,
        arguments: Value,
        prompt: &str,
        cwd: &Path,
    ) -> Result<Value, String> {
        if config.protocol == "mcp" {
            let info = self.request("initialize", json!({"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"folio","version":"0.1.0"}})).await?;
            let supported = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
            if !info["protocolVersion"]
                .as_str()
                .is_some_and(|version| supported.contains(&version))
            {
                return Err("Server negotiated an unsupported MCP protocol version.".into());
            }
            self.send(json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
                .await?;
            if action == "test" {
                let mut all_tools = Vec::new();
                let mut cursor = Value::Null;
                for _ in 0..100 {
                    let params = if cursor.is_null() {
                        json!({})
                    } else {
                        json!({"cursor":cursor})
                    };
                    let result = self.request("tools/list", params).await?;
                    if let Some(tools) = result["tools"].as_array() {
                        all_tools.extend(tools.iter().cloned());
                    }
                    cursor = result.get("nextCursor").cloned().unwrap_or(Value::Null);
                    if cursor.is_null() {
                        return Ok(json!({"server":info,"tools":all_tools}));
                    }
                }
                return Err("The server returned too many pages of tools.".into());
            }
            if action != "call" || tool.trim().is_empty() || !arguments.is_object() {
                return Err("Specify a tool name and a JSON arguments object.".into());
            }
            self.request("tools/call", json!({"name":tool,"arguments":arguments}))
                .await
        } else if config.protocol == "acp" {
            let info = self.initialize_acp(config).await?;
            if info["protocolVersion"] != 1 {
                return Err("This client supports ACP protocol version 1.".into());
            }
            if action == "test" {
                return Ok(info);
            }
            if action == "logout" {
                if !info["agentCapabilities"]["auth"]["logout"].is_object() {
                    return Err("This agent does not offer sign-out through ACP. Use its own account settings.".into());
                }
                self.request("logout", json!({})).await?;
                return Ok(json!({"signedOut":true}));
            }
            if action == "authenticate" {
                let method = auth_method(&info, &arguments)?;
                if method["type"] == "terminal" {
                    terminal_login(config, &method, cwd).await?;
                    let _ = self.child.kill().await;
                    let _ = self.child.wait().await;
                    *self = Rpc::spawn(config, cwd)?;
                    self.initialize_acp(config).await?;
                } else {
                    self.request("authenticate", json!({"methodId":method["id"]}))
                        .await?;
                }
            }
            if !["prompt", "authenticate", "check", "models"].contains(&action)
                || (action == "prompt" && prompt.trim().is_empty())
            {
                return Err("Enter a message to send to the agent.".into());
            }
            let session = self
                .request(
                    "session/new",
                    json!({"cwd":cwd.to_string_lossy(),"mcpServers":[]}),
                )
                .await?;
            let session_id = session["sessionId"]
                .as_str()
                .ok_or("Agent did not return a session ID")?;
            let choices = model_catalog(&session);
            if action == "models" {
                return Ok(choices);
            }
            if action == "prompt" {
                if let Some(model) = config.model_id.as_deref().filter(|value| !value.is_empty()) {
                    if !choices["models"]
                        .as_array()
                        .is_some_and(|models| models.iter().any(|item| item["id"] == model))
                    {
                        return Err(format!("The saved model '{model}' is not offered by this agent. Refresh models and choose another model before retrying."));
                    }
                    if let Some(config_id) = choices["configId"].as_str() {
                        let applied = self
                            .request(
                                "session/set_config_option",
                                json!({"sessionId":session_id,"configId":config_id,"value":model}),
                            )
                            .await?;
                        let confirmed = model_catalog(&applied);
                        if confirmed["currentModel"] != model {
                            return Err("The agent did not confirm the selected model. No message was sent.".into());
                        }
                    } else {
                        self.request(
                            "session/set_model",
                            json!({"sessionId":session_id,"modelId":model}),
                        )
                        .await?;
                    }
                }
            }
            if action != "prompt" {
                return Ok(json!({"ready":true}));
            }
            let result = self
                .request(
                    "session/prompt",
                    json!({"sessionId":session_id,"prompt":[{"type":"text","text":prompt}]}),
                )
                .await?;
            let text: String = self
                .updates
                .iter()
                .filter(|update| update["update"]["sessionUpdate"] == "agent_message_chunk")
                .filter_map(|update| update["update"]["content"]["text"].as_str())
                .collect();
            Ok(json!({"text":text,"result":result,"updates":self.updates}))
        } else {
            Err("Unknown connection protocol.".into())
        }
    }

    async fn initialize_acp(&mut self, config: &ConnectionConfig) -> Result<Value, String> {
        let mut info = self.request("initialize", json!({"protocolVersion":1,"clientCapabilities":{"auth":{"terminal":cfg!(windows)}},"clientInfo":{"name":"folio","version":"0.1.0"}})).await?;
        if info["protocolVersion"] != 1 {
            return Err("This client supports ACP protocol version 1.".into());
        }
        if cfg!(windows) {
            if let (Some(login), Some(methods)) =
                (&config.terminal_login, info["authMethods"].as_array_mut())
            {
                for method in methods {
                    if method["id"] == login.method_id {
                        method["type"] = json!("terminal");
                    }
                }
            }
        }
        Ok(info)
    }
}

fn model_catalog(session: &Value) -> Value {
    let option = session["configOptions"].as_array().and_then(|options| {
        options.iter().find(|item| {
            item["type"] == "select" && (item["category"] == "model" || item["id"] == "model")
        })
    });
    if let Some(option) = option {
        let mut models = Vec::new();
        if let Some(options) = option["options"].as_array() {
            for entry in options {
                let entries = entry["options"]
                    .as_array()
                    .cloned()
                    .unwrap_or_else(|| vec![entry.clone()]);
                for choice in entries {
                    if let (Some(id), Some(name)) =
                        (choice["value"].as_str(), choice["name"].as_str())
                    {
                        models.push(json!({"id":id,"name":name}));
                    }
                }
            }
        }
        return json!({"models":models,"currentModel":option["currentValue"],"configId":option["id"]});
    }
    let models: Vec<Value> = session["models"]["availableModels"]
        .as_array()
        .map(|models| {
            models
                .iter()
                .filter_map(|item| {
                    Some(json!({"id":item["modelId"].as_str()?,"name":item["name"].as_str()?}))
                })
                .collect()
        })
        .unwrap_or_default();
    json!({"models":models,"currentModel":session["models"]["currentModelId"]})
}

fn auth_method(info: &Value, arguments: &Value) -> Result<Value, String> {
    let method_id = arguments["methodId"]
        .as_str()
        .ok_or("Choose a sign-in method")?;
    let method = info["authMethods"]
        .as_array()
        .and_then(|methods| methods.iter().find(|method| method["id"] == method_id))
        .ok_or("The agent no longer advertises this sign-in method. Connect again.")?;
    if !["agent", "terminal"].contains(&method["type"].as_str().unwrap_or("agent")) {
        return Err("This authentication method is not supported by Folio. Use the agent's own setup instead.".into());
    }
    Ok(method.clone())
}

async fn terminal_login(
    config: &ConnectionConfig,
    method: &Value,
    cwd: &Path,
) -> Result<(), String> {
    if !cfg!(windows) {
        return Err("Interactive login terminals are currently supported on Windows only.".into());
    }
    let args: Vec<String> =
        serde_json::from_value(method.get("args").cloned().unwrap_or(json!([])))
            .map_err(|_| "Invalid login arguments")?;
    let env: std::collections::HashMap<String, String> =
        serde_json::from_value(method.get("env").cloned().unwrap_or(json!({})))
            .map_err(|_| "Invalid login environment")?;
    if args.len() > 128 || env.len() > 64 {
        return Err("Login configuration exceeds the size limit".into());
    }
    let mut command = Command::new(&config.command);
    let launch_args = match &config.terminal_login {
        Some(login) if method["id"] == login.method_id => login.args.clone(),
        _ => config.args.iter().cloned().chain(args).collect(),
    };
    command
        .args(launch_args)
        .envs(env)
        .current_dir(cwd)
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x00000010);
    let status = command
        .status()
        .await
        .map_err(|error| format!("Could not open the login terminal: {error}"))?;
    if !status.success() {
        return Err("Login was cancelled or failed. Connect again to retry.".into());
    }
    Ok(())
}

pub async fn run(
    mut config: ConnectionConfig,
    action: String,
    tool: String,
    arguments: Value,
    prompt: String,
    cwd: &Path,
) -> Result<Value, String> {
    if prompt.len() > 200_000 || arguments.to_string().len() > 200_000 {
        return Err("Agent input exceeds the size limit.".into());
    }
    if action == "models" {
        config.model_id = None;
    }
    let mut rpc = Rpc::spawn(&config, cwd)?;
    let seconds = if action == "authenticate" || (config.protocol == "mcp" && action == "test") {
        360
    } else {
        120
    };
    let result = tokio::time::timeout(
        Duration::from_secs(seconds),
        rpc.exchange(&config, &action, &tool, arguments, &prompt, cwd),
    )
    .await
    .map_err(|_| format!("The connection timed out after {seconds} seconds. Retry when you are ready to sign in."))
    .and_then(|value| value);
    let _ = rpc.child.kill().await;
    let _ = rpc.child.wait().await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(protocol: &str, mode: &str) -> ConnectionConfig {
        let fixture =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/protocol-peer.mjs");
        ConnectionConfig {
            id: "test".into(),
            name: "Test peer".into(),
            protocol: protocol.into(),
            command: "node".into(),
            terminal_login: None,
            model_id: None,
            provider_id: None,
            args: vec![
                fixture.to_string_lossy().into_owned(),
                protocol.into(),
                mode.into(),
            ],
        }
    }

    #[test]
    fn discovers_and_applies_models_before_prompting() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            for mode in ["models", "legacy-models"] {
                let cwd = std::env::temp_dir();
                let mut agent = config("acp", mode);
                agent.model_id = Some("model-quality".into());
                let response = run(
                    agent,
                    "prompt".into(),
                    String::new(),
                    json!({}),
                    "Hello".into(),
                    &cwd,
                )
                .await
                .unwrap();
                assert_eq!(response["text"], "Hello from the test agent.");
                let mut agent = config("acp", mode);
                agent.model_id = Some("unavailable".into());
                assert!(run(
                    agent,
                    "prompt".into(),
                    String::new(),
                    json!({}),
                    "Hello".into(),
                    &cwd
                )
                .await
                .unwrap_err()
                .contains("not offered"));
                let catalog = run(
                    config("acp", mode),
                    "models".into(),
                    String::new(),
                    json!({}),
                    String::new(),
                    &cwd,
                )
                .await
                .unwrap();
                assert!(catalog["models"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|model| model["id"] == "model-quality"));
            }
        });
    }

    #[test]
    fn mcp_initializes_paginates_calls_and_reports_errors() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let cwd = std::env::temp_dir();
            let tools = run(
                config("mcp", ""),
                "test".into(),
                String::new(),
                json!({}),
                String::new(),
                &cwd,
            )
            .await
            .unwrap();
            assert_eq!(tools["tools"].as_array().unwrap().len(), 2);
            let response = run(
                config("mcp", ""),
                "call".into(),
                "echo".into(),
                json!({"text":"hello"}),
                String::new(),
                &cwd,
            )
            .await
            .unwrap();
            assert_eq!(response["content"][0]["text"], "{\"text\":\"hello\"}");
            let error = run(
                config("mcp", "error"),
                "test".into(),
                String::new(),
                json!({}),
                String::new(),
                &cwd,
            )
            .await
            .unwrap_err();
            assert!(error.contains("Expected test error"));
        });
    }

    #[test]
    fn acp_authentication_uses_advertised_methods_and_verifies_a_session() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let cwd = std::env::temp_dir();
            let call = |action: &str, arguments: Value| {
                run(
                    config("acp", "auth-required"),
                    action.into(),
                    String::new(),
                    arguments,
                    String::new(),
                    &cwd,
                )
            };
            let info = call("test", json!({})).await.unwrap();
            assert_eq!(info["authMethods"][0]["id"], "browser-login");
            assert!(call("check", json!({}))
                .await
                .unwrap_err()
                .contains("Authentication required"));
            assert_eq!(
                call("authenticate", json!({"methodId":"browser-login"}))
                    .await
                    .unwrap()["ready"],
                true
            );
            assert!(call("authenticate", json!({"methodId":"invented"}))
                .await
                .unwrap_err()
                .contains("no longer advertises"));
            assert!(call("authenticate", json!({"methodId":"unsupported"}))
                .await
                .unwrap_err()
                .contains("not supported"));
            assert_eq!(call("logout", json!({})).await.unwrap()["signedOut"], true);
            assert!(run(
                config("acp", ""),
                "logout".into(),
                String::new(),
                json!({}),
                String::new(),
                &cwd
            )
            .await
            .unwrap_err()
            .contains("does not offer"));
        });
    }

    #[test]
    fn acp_creates_session_collects_chunks_and_denies_permissions() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let response = run(
                config("acp", ""),
                "prompt".into(),
                String::new(),
                json!({}),
                "Help with my CV".into(),
                &std::env::temp_dir(),
            )
            .await
            .unwrap();
            assert_eq!(response["text"], "Hello from the test agent.");
            assert_eq!(response["result"]["stopReason"], "end_turn");
        });
    }
}
