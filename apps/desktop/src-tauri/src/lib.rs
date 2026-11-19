// Rust core commands. Every native capability is exposed as an explicit,
// narrowly-scoped command - no shell execution, no broad filesystem access.

pub mod db;
pub mod secrets;
pub mod locale;
pub mod speech_recognition;

use std::path::PathBuf;
use tauri::Manager;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub status: String,
    pub app_version: String,
    pub os: String,
    pub arch: String,
}

/// Minimal health check used by the frontend to verify the IPC bridge works.
/// No side effects; safe to call at startup.
#[tauri::command]
fn health_check() -> HealthReport {
    HealthReport {
        status: "ok".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

#[tauri::command]
fn get_system_locale() -> locale::SystemLocaleInfo {
    locale::read_system_locale()
}

/// Resolves the app-specific data directory, initializes the SQLite database
/// and applies pending migrations. Called once from the Tauri setup hook.
fn init_database(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir failed: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create app data dir failed: {e}"))?;
    let db_path = dir.join("language-lab.db");

    let db = db::Db::open(&db_path).map_err(|e| format!("open database failed: {e}"))?;
    {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let applied = db::run_migrations(&conn, &db_path)?;
        if applied > 0 {
            println!("[db] applied {applied} migration(s)");
        }
    }
    app.manage(db);
    Ok(db_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            health_check,
            get_system_locale,
            db::db_execute,
            db::db_select,
            db::db_status,
            db::db_backup,
            db::db_restore,
            secrets::secrets_set,
            secrets::secrets_get,
            secrets::secrets_delete,
            speech_recognition::speech_transcribe_device
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            init_database(&handle).map_err(|e| format!("database init failed: {e}"))?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
