use crate::protocol::{ConnectionConfig, TerminalLogin};
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

#[derive(Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub package: String,
    pub version: String,
    pub bin: String,
    pub args: Vec<String>,
    pub protocol: String,
}

pub fn catalog() -> Vec<Provider> {
    serde_json::from_str(include_str!("../../src/provider-catalog.json"))
        .expect("Invalid provider catalog")
}

fn provider(id: &str) -> Result<Provider, String> {
    catalog()
        .into_iter()
        .find(|entry| entry.id == id)
        .ok_or("Unknown provider".into())
}

fn node_path() -> Result<PathBuf, String> {
    let executable = if cfg!(windows) { "node.exe" } else { "node" };
    std::env::var_os("PATH").into_iter().flat_map(|paths| std::env::split_paths(&paths).collect::<Vec<_>>())
        .filter(|directory| directory.is_absolute()).map(|directory| directory.join(executable))
        .find(|path| path.is_file()).ok_or("Install Node.js 22 or newer (including npm), then restart Folio. No agent executable paths are needed.".into())
}

fn directory(root: &Path, entry: &Provider) -> PathBuf {
    root.join("providers").join(&entry.id).join(&entry.version)
}

fn installed(root: &Path, entry: &Provider) -> bool {
    std::fs::read_to_string(directory(root, entry).join("install-complete"))
        .is_ok_and(|value| value == format!("{}@{}", entry.package, entry.version))
        && entrypoint(root, entry).is_ok()
}

fn entrypoint(root: &Path, entry: &Provider) -> Result<PathBuf, String> {
    let package_dir = directory(root, entry)
        .join("node_modules")
        .join(&entry.package);
    let manifest: Value = serde_json::from_slice(
        &std::fs::read(package_dir.join("package.json"))
            .map_err(|_| "Provider is not installed. Choose Install & connect first.")?,
    )
    .map_err(|error| error.to_string())?;
    if manifest["version"] != entry.version || manifest["name"] != entry.package {
        return Err(
            "Provider installation does not match the pinned version. Reinstall it.".into(),
        );
    }
    let relative = manifest["bin"]
        .as_str()
        .or_else(|| manifest["bin"][&entry.bin].as_str())
        .ok_or("Provider package has no supported executable")?;
    let base = package_dir
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let path = package_dir
        .join(relative)
        .canonicalize()
        .map_err(|_| "Provider installation is incomplete. Reinstall it.")?;
    if !path.starts_with(&base) || !path.is_file() {
        return Err("Invalid provider executable path".into());
    }
    Ok(path)
}

pub fn status(root: &Path) -> Value {
    json!({"nodeAvailable":node_path().is_ok(), "providers":catalog().iter().map(|entry| json!({"id":entry.id,"installed":installed(root, entry)})).collect::<Vec<_>>()})
}

pub fn validate_remote_url(value: &str) -> Result<String, String> {
    let url =
        reqwest::Url::parse(value.trim()).map_err(|_| "Enter a valid HTTPS MCP server URL.")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.query().is_some()
    {
        return Err("Use an HTTPS server URL without credentials, query parameters, or fragments. Sign in through the provider, not through a token in the URL.".into());
    }
    Ok(url.to_string())
}

pub fn connection(root: &Path, id: &str, remote_url: &str) -> Result<ConnectionConfig, String> {
    let entry = provider(id)?;
    let node = node_path()?;
    if !installed(root, &entry) {
        return Err("Provider is not installed completely. Choose Install & connect first.".into());
    }
    let script = entrypoint(root, &entry)?;
    let native = script
        .extension()
        .is_some_and(|extension| extension == "exe");
    let command = if native { script.clone() } else { node };
    let mut args = if native {
        Vec::new()
    } else {
        vec![script.to_string_lossy().into_owned()]
    };
    let terminal_login = if id == "opencode" {
        let mut login_args = args.clone();
        login_args.extend(["auth".into(), "login".into()]);
        Some(TerminalLogin {
            method_id: "opencode-login".into(),
            args: login_args,
        })
    } else {
        None
    };
    args.extend(entry.args);
    if id == "mcp-remote" {
        args.extend([
            validate_remote_url(remote_url)?,
            "--auth-timeout".into(),
            "300".into(),
        ]);
    }
    Ok(ConnectionConfig {
        id: format!("provider-{id}"),
        name: entry.name,
        protocol: entry.protocol,
        command: command.to_string_lossy().into_owned(),
        args,
        terminal_login,
        model_id: None,
        provider_id: Some(id.into()),
    })
}

pub async fn install(root: &Path, id: &str) -> Result<(), String> {
    let entry = provider(id)?;
    let node = node_path()?;
    let mut version_command = Command::new(&node);
    version_command.arg("--version").kill_on_drop(true);
    #[cfg(windows)]
    version_command.creation_flags(0x08000000);
    let version = tokio::time::timeout(Duration::from_secs(10), version_command.output())
        .await
        .map_err(|_| "Node.js version check timed out")?
        .map_err(|error| error.to_string())?;
    let text = String::from_utf8_lossy(&version.stdout);
    let numbers: Vec<u32> = text
        .trim()
        .trim_start_matches('v')
        .split('.')
        .filter_map(|part| part.parse().ok())
        .collect();
    if !version.status.success() || numbers.len() < 2 || numbers[0] < 22 {
        return Err("Install Node.js 22 or newer, then restart Folio.".into());
    }
    let parent = node.parent().ok_or("Cannot locate Node.js directory")?;
    let mut candidates = vec![
        parent.join("node_modules/npm/bin/npm-cli.js"),
        parent.join("../lib/node_modules/npm/bin/npm-cli.js"),
    ];
    if let Some(appdata) = std::env::var_os("APPDATA") {
        candidates.push(PathBuf::from(appdata).join("npm/node_modules/npm/bin/npm-cli.js"));
    }
    let npm = candidates.into_iter().find(|path| path.is_file()).ok_or(
        "npm was not found beside Node.js. Reinstall Node.js with npm, then restart Folio.",
    )?;
    let destination = directory(root, &entry);
    std::fs::create_dir_all(&destination).map_err(|error| error.to_string())?;
    let marker = destination.join("install-complete");
    if marker.exists() {
        std::fs::remove_file(&marker).map_err(|error| error.to_string())?;
    }
    let mut command = Command::new(node);
    command
        .arg(npm)
        .args(["install", "--prefix"])
        .arg(&destination)
        .args([
            "--registry=https://registry.npmjs.org",
            "--no-audit",
            "--no-fund",
            "--save-exact",
            "--engine-strict",
            "--offline=false",
            "--cache",
        ])
        .arg(root.join("provider-npm-cache"))
        .arg(format!("{}@{}", entry.package, entry.version))
        .current_dir(&destination)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let status = tokio::time::timeout(Duration::from_secs(600), command.status())
        .await
        .map_err(|_| "Installation timed out. Check your network and retry.")?
        .map_err(|error| error.to_string())?;
    if !status.success() {
        return Err(format!("Could not install {}@{}. Check Node.js compatibility, your network, and available disk space, then retry.", entry.package, entry.version));
    }
    entrypoint(root, &entry)?;
    std::fs::write(marker, format!("{}@{}", entry.package, entry.version))
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_catalog_providers_and_safe_remote_urls_are_accepted() {
        assert!(provider("../../arbitrary-package").is_err());
        assert_eq!(catalog().len(), 6);
        for bad in [
            "http://example.com",
            "file:///etc/passwd",
            "https://user:secret@example.com",
            "https://example.com?token=secret",
            "https://example.com/#token",
        ] {
            assert!(validate_remote_url(bad).is_err());
        }
        assert_eq!(
            validate_remote_url("https://example.com/mcp").unwrap(),
            "https://example.com/mcp"
        );
    }

    #[test]
    fn package_entrypoint_cannot_escape_its_directory() {
        let root = std::env::temp_dir().join(format!("folio-provider-test-{}", std::process::id()));
        let entry = provider("codex").unwrap();
        let package_dir = directory(&root, &entry)
            .join("node_modules")
            .join(&entry.package);
        std::fs::create_dir_all(&package_dir).unwrap();
        std::fs::write(package_dir.join("../outside.js"), "").unwrap();
        std::fs::write(package_dir.join("package.json"), json!({"name":entry.package,"version":entry.version,"bin":{"codex-acp":"../outside.js"}}).to_string()).unwrap();
        assert!(entrypoint(&root, &entry).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
