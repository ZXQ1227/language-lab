// Rust core commands. Every native capability is exposed as an explicit,
// narrowly-scoped command - no shell execution, no broad filesystem access.

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![health_check])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
