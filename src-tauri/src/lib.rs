mod ai;
mod db;
mod protocol;
mod providers;

use db::Database;
use serde_json::Value;
use tauri::Manager;

#[derive(Default)]
struct ConnectionTasks(
    std::sync::Mutex<std::collections::HashMap<String, Option<tokio::sync::oneshot::Sender<()>>>>,
);

#[tauri::command]
fn provider_status(app: tauri::AppHandle) -> Result<Value, String> {
    Ok(providers::status(
        &app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?,
    ))
}

#[tauri::command]
async fn install_provider(
    app: tauri::AppHandle,
    provider_id: String,
    lock: tauri::State<'_, tokio::sync::Mutex<()>>,
) -> Result<(), String> {
    let _guard = lock
        .try_lock()
        .map_err(|_| "Another provider is being installed. Wait for it to finish.")?;
    providers::install(
        &app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?,
        &provider_id,
    )
    .await
}

#[tauri::command]
fn provider_connection(
    app: tauri::AppHandle,
    provider_id: String,
    remote_url: String,
) -> Result<protocol::ConnectionConfig, String> {
    providers::connection(
        &app.path()
            .app_data_dir()
            .map_err(|error| error.to_string())?,
        &provider_id,
        &remote_url,
    )
}

#[tauri::command]
fn cancel_connection(tasks: tauri::State<'_, ConnectionTasks>, id: String) -> Result<(), String> {
    if let Some(sender) = tasks
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .get_mut(&id)
        .and_then(Option::take)
    {
        let _ = sender.send(());
    }
    Ok(())
}

#[tauri::command]
fn list_cvs(database: tauri::State<'_, Database>) -> Result<Vec<Value>, String> {
    database.list()
}

#[tauri::command]
fn save_cv(database: tauri::State<'_, Database>, cv: Value) -> Result<(), String> {
    database.save(&cv)
}

#[tauri::command]
fn delete_cv(database: tauri::State<'_, Database>, id: String) -> Result<(), String> {
    database.delete(&id)
}

#[tauri::command]
fn list_templates(database: tauri::State<'_, Database>) -> Result<Vec<Value>, String> {
    database.templates()
}

#[tauri::command]
fn save_template(database: tauri::State<'_, Database>, preset: Value) -> Result<(), String> {
    database.save_template(&preset)
}

#[tauri::command]
fn delete_template(database: tauri::State<'_, Database>, id: String) -> Result<(), String> {
    database.delete_template(&id)
}

#[tauri::command]
fn get_settings(database: tauri::State<'_, Database>) -> Result<Option<Value>, String> {
    database.settings()
}

#[tauri::command]
fn set_connection_model(
    database: tauri::State<'_, Database>,
    id: String,
    model_id: String,
) -> Result<(), String> {
    database.set_connection_model(&id, &model_id)
}

#[tauri::command]
fn save_settings(
    database: tauri::State<'_, Database>,
    settings: Value,
    api_key: String,
) -> Result<(), String> {
    let provider: ai::Provider =
        serde_json::from_value(settings["provider"].clone()).map_err(|error| error.to_string())?;
    let connections: Vec<protocol::ConnectionConfig> =
        serde_json::from_value(settings["connections"].clone())
            .map_err(|error| error.to_string())?;
    if connections.len() > 30 {
        return Err("You can save up to 30 connections.".into());
    }
    if !provider.base_url.is_empty() {
        ai::validate_url(&provider.base_url)?;
    }
    if !api_key.is_empty() {
        ai::credential(&provider.base_url)?
            .set_password(&api_key)
            .map_err(|error| format!("Could not save the API key securely: {error}"))?;
    }
    database.save_settings(&settings)
}

fn provider(database: &Database) -> Result<ai::Provider, String> {
    let settings = database
        .settings()?
        .ok_or("Configure your AI provider in Settings first.")?;
    serde_json::from_value(settings["provider"].clone()).map_err(|error| error.to_string())
}

#[tauri::command]
fn clear_api_key(database: tauri::State<'_, Database>) -> Result<(), String> {
    let provider = provider(&database)?;
    match ai::credential(&provider.base_url)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
async fn ai_text(database: tauri::State<'_, Database>, prompt: String) -> Result<String, String> {
    ai::text(provider(&database)?, prompt).await
}

#[tauri::command]
async fn ai_portrait(
    database: tauri::State<'_, Database>,
    photo: String,
    outfit: String,
) -> Result<String, String> {
    ai::portrait(provider(&database)?, photo, outfit).await
}

#[tauri::command]
async fn transcribe(
    database: tauri::State<'_, Database>,
    bytes: Vec<u8>,
    mime: String,
) -> Result<String, String> {
    ai::transcribe(provider(&database)?, bytes, mime).await
}

#[tauri::command]
fn write_pdf(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if !path.to_lowercase().ends_with(".pdf")
        || !bytes.starts_with(b"%PDF-")
        || bytes.len() > 30 * 1024 * 1024
    {
        return Err("Invalid PDF export.".into());
    }
    std::fs::write(path, bytes).map_err(|error| error.to_string())
}

#[tauri::command]
async fn run_connection(
    app: tauri::AppHandle,
    database: tauri::State<'_, Database>,
    id: String,
    action: String,
    tool_name: String,
    arguments: Value,
    prompt: String,
) -> Result<Value, String> {
    let tasks = app.state::<ConnectionTasks>();
    let settings = database.settings()?.ok_or("Save a connection first.")?;
    let connections: Vec<protocol::ConnectionConfig> =
        serde_json::from_value(settings["connections"].clone())
            .map_err(|error| error.to_string())?;
    let config = connections
        .into_iter()
        .find(|connection| connection.id == id)
        .ok_or("Connection not found")?;
    let cwd = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("agent-workspace");
    std::fs::create_dir_all(&cwd).map_err(|error| error.to_string())?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    {
        let mut running = tasks.0.lock().map_err(|error| error.to_string())?;
        if running.contains_key(&id) {
            return Err("This connection is already busy.".into());
        }
        running.insert(id.clone(), Some(sender));
    }
    let result = tokio::select! {
        result = protocol::run(config, action, tool_name, arguments, prompt, &cwd) => result,
        _ = receiver => Err("Connection cancelled.".into()),
    };
    tasks
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&id);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ConnectionTasks::default())
        .manage(tokio::sync::Mutex::new(()))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let database =
                Database::open(&directory.join("folio.sqlite3")).map_err(std::io::Error::other)?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_cvs,
            save_cv,
            delete_cv,
            list_templates,
            save_template,
            delete_template,
            get_settings,
            save_settings,
            set_connection_model,
            clear_api_key,
            ai_text,
            ai_portrait,
            transcribe,
            write_pdf,
            run_connection,
            provider_status,
            provider_connection,
            install_provider,
            cancel_connection
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Folio");
}
