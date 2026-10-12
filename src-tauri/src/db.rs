use rusqlite::{params, Connection};
use serde_json::Value;
use std::path::Path;
use std::sync::Mutex;

pub struct Database(pub Mutex<Connection>);

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; BEGIN; CREATE TABLE IF NOT EXISTS cvs (id TEXT PRIMARY KEY NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY NOT NULL, document TEXT NOT NULL, updated_at TEXT NOT NULL); PRAGMA user_version=2; COMMIT;").map_err(|error| error.to_string())?;
        Ok(Self(Mutex::new(connection)))
    }

    pub fn list(&self) -> Result<Vec<Value>, String> {
        let connection = self.0.lock().map_err(|error| error.to_string())?;
        let mut statement = connection
            .prepare("SELECT document FROM cvs ORDER BY updated_at DESC")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.map(|row| {
            serde_json::from_str(&row.map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())
        })
        .collect()
    }

    pub fn save(&self, cv: &Value) -> Result<(), String> {
        let id = cv
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .ok_or("CV must have an ID")?;
        let updated = cv
            .get("updatedAt")
            .and_then(Value::as_str)
            .ok_or("CV must have an update timestamp")?;
        let document = serde_json::to_string(cv).map_err(|error| error.to_string())?;
        if document.len() > 12 * 1024 * 1024 {
            return Err("CV exceeds the 12 MB limit".into());
        }
        self.0.lock().map_err(|error| error.to_string())?.execute("INSERT INTO cvs (id, document, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at", params![id, document, updated]).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|error| error.to_string())?
            .execute("DELETE FROM cvs WHERE id=?1", [id])
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn settings(&self) -> Result<Option<Value>, String> {
        use rusqlite::OptionalExtension;
        let document: Option<String> = self
            .0
            .lock()
            .map_err(|error| error.to_string())?
            .query_row("SELECT document FROM settings WHERE id=1", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(|error| error.to_string())?;
        document
            .map(|text| serde_json::from_str(&text).map_err(|error| error.to_string()))
            .transpose()
    }

    pub fn templates(&self) -> Result<Vec<Value>, String> {
        let connection = self.0.lock().map_err(|error| error.to_string())?;
        let mut statement = connection
            .prepare("SELECT document FROM templates ORDER BY updated_at DESC")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.map(|row| {
            serde_json::from_str(&row.map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())
        })
        .collect()
    }

    pub fn save_template(&self, preset: &Value) -> Result<(), String> {
        let id = preset["id"]
            .as_str()
            .filter(|value| !value.is_empty())
            .ok_or("Template must have an ID")?;
        let name = preset["name"]
            .as_str()
            .filter(|value| !value.trim().is_empty() && value.chars().count() <= 80)
            .ok_or("Template must have a name")?;
        let updated = preset["updatedAt"]
            .as_str()
            .ok_or("Template must have a timestamp")?;
        if !preset["design"].is_object() || preset["design"]["version"] != 1 {
            return Err("Invalid template design".into());
        }
        let document = serde_json::json!({"id":id,"name":name,"template":preset["template"],"accent":preset["accent"],"design":preset["design"],"updatedAt":updated}).to_string();
        if document.len() > 64 * 1024 {
            return Err("Template exceeds the 64 KB limit".into());
        }
        self.0.lock().map_err(|error| error.to_string())?.execute("INSERT INTO templates (id, document, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at", params![id, document, updated]).map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn delete_template(&self, id: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|error| error.to_string())?
            .execute("DELETE FROM templates WHERE id=?1", [id])
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn set_connection_model(&self, id: &str, model: &str) -> Result<(), String> {
        if model.len() > 256 || model.chars().any(char::is_control) {
            return Err("Invalid model ID".into());
        }
        let connection = self.0.lock().map_err(|error| error.to_string())?;
        let document: String = connection
            .query_row("SELECT document FROM settings WHERE id=1", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        let mut settings: Value =
            serde_json::from_str(&document).map_err(|error| error.to_string())?;
        let agent = settings["connections"]
            .as_array_mut()
            .and_then(|items| {
                items
                    .iter_mut()
                    .find(|item| item["id"] == id && item["protocol"] == "acp")
            })
            .ok_or("Saved ACP connection not found")?;
        agent["modelId"] = Value::String(model.into());
        connection
            .execute(
                "UPDATE settings SET document=?1 WHERE id=1",
                [settings.to_string()],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn save_settings(&self, settings: &Value) -> Result<(), String> {
        self.0.lock().map_err(|error| error.to_string())?.execute("INSERT INTO settings (id, document) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET document=excluded.document", [settings.to_string()]).map_err(|error| error.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn model_selection_preserves_other_settings() {
        let db = Database::open(Path::new(":memory:")).unwrap();
        db.save_settings(&json!({"provider":{"textModel":"unchanged"},"connections":[{"id":"agent","protocol":"acp","args":[]},{"id":"tools","protocol":"mcp"}]})).unwrap();
        db.set_connection_model("agent", "model-quality").unwrap();
        let settings = db.settings().unwrap().unwrap();
        assert_eq!(settings["connections"][0]["modelId"], "model-quality");
        assert_eq!(settings["provider"]["textModel"], "unchanged");
        assert!(db.set_connection_model("tools", "model-quality").is_err());
        db.set_connection_model("agent", "").unwrap();
        assert_eq!(
            db.settings().unwrap().unwrap()["connections"][0]["modelId"],
            ""
        );
    }

    #[test]
    fn templates_survive_migration_reopen_and_delete() {
        let path =
            std::env::temp_dir().join(format!("folio-templates-{}.sqlite", std::process::id()));
        {
            let connection = Connection::open(&path).unwrap();
            connection.execute_batch("CREATE TABLE cvs (id TEXT PRIMARY KEY, document TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE settings (id INTEGER PRIMARY KEY, document TEXT NOT NULL); INSERT INTO settings VALUES (1, '{}'); PRAGMA user_version=1;").unwrap();
        }
        {
            let db = Database::open(&path).unwrap();
            assert!(db.settings().unwrap().is_some());
            let preset = json!({"id":"design", "name":"Signature", "template":"classic", "accent":"#333333", "updatedAt":"2026-10-07", "design":{"version":1}, "photo":"private data"});
            db.save_template(&preset).unwrap();
            db.save_template(&preset).unwrap();
            assert_eq!(db.templates().unwrap().len(), 1);
            assert!(db.templates().unwrap()[0].get("photo").is_none());
        }
        {
            let db = Database::open(&path).unwrap();
            assert_eq!(db.templates().unwrap()[0]["name"], "Signature");
            db.delete_template("design").unwrap();
            assert!(db.templates().unwrap().is_empty());
            assert!(db.save_template(&json!({"id":""})).is_err());
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn crud_survives_reopen_and_upserts() {
        let path = std::env::temp_dir().join(format!("folio-test-{}.sqlite", std::process::id()));
        {
            let db = Database::open(&path).unwrap();
            db.save(&json!({"id":"test", "updatedAt":"2026-01-01", "name":"First"}))
                .unwrap();
            db.save(&json!({"id":"test", "updatedAt":"2026-01-02", "name":"Updated", "interview":{"step":1,"draft":"Unsent message","history":[{"question":"Name?","answer":"Burak","reply":"Thanks!","assistant":"Codex"}]}}))
                .unwrap();
            assert_eq!(db.list().unwrap().len(), 1);
            db.save_settings(&json!({"provider":{}})).unwrap();
        }
        {
            let db = Database::open(&path).unwrap();
            assert_eq!(db.list().unwrap()[0]["name"], "Updated");
            let interview = &db.list().unwrap()[0]["interview"];
            assert_eq!(interview["step"], 1);
            assert_eq!(interview["draft"], "Unsent message");
            assert_eq!(interview["history"][0]["reply"], "Thanks!");
            assert!(db.settings().unwrap().is_some());
            db.delete("test").unwrap();
            assert!(db.list().unwrap().is_empty());
            assert!(db.save(&json!({"id":""})).is_err());
        }
        std::fs::remove_file(path).unwrap();
    }
}
