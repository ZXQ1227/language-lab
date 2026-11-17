// Rust core entry. Real commands (db_*, ai_proxy, keyring_*, backup_*) arrive
// with their respective blueprint tasks - see AGENTS.md.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
