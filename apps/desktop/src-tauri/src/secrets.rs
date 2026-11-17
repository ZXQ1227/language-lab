//! OS secure credential storage for provider API keys.
//!
//! Backed by the `keyring` crate: macOS Keychain / Windows Credential
//! Manager. Keys are namespaced per capability (e.g. `llm.openai`) and never
//! leave the OS store except over the explicit `secrets_get` command during
//! provider construction. No command ever returns or logs more than one key,
//! and there is no enumerate/list operation by design.

use keyring::Entry;

const SERVICE: &str = "com.languagelab.desktop";

fn entry(name: &str) -> Result<Entry, String> {
    if name.is_empty() || name.len() > 128 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("invalid secret name".to_string());
    }
    Entry::new(SERVICE, name).map_err(|e| format!("keyring entry failed: {e}"))
}

/// Stores (or overwrites) a secret. The value is never logged.
#[tauri::command]
pub fn secrets_set(name: String, value: String) -> Result<(), String> {
    entry(&name)?
        .set_password(&value)
        .map_err(|e| format!("secrets_set failed: {e}"))
}

/// Reads a secret; returns None when not set.
#[tauri::command]
pub fn secrets_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("secrets_get failed: {e}")),
    }
}

/// Deletes a secret; deleting a missing key is not an error.
#[tauri::command]
pub fn secrets_delete(name: String) -> Result<(), String> {
    match entry(&name)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("secrets_delete failed: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Integration test against the real OS keychain. Skipped by default:
    // sandboxed environments cannot write the login keychain. Run explicitly
    // on dev machines / CI: `cargo test --lib -- --include-ignored`.
    #[test]
    #[ignore]
    fn keyring_roundtrip() {
        let name = "test.roundtrip-key";
        secrets_set(name.to_string(), "sk-test-value".to_string()).unwrap();
        let value = secrets_get(name.to_string()).unwrap();
        assert_eq!(value.as_deref(), Some("sk-test-value"));
        secrets_delete(name.to_string()).unwrap();
        assert_eq!(secrets_get(name.to_string()).unwrap(), None);
        // Deleting again is fine.
        secrets_delete(name.to_string()).unwrap();
    }

    #[test]
    fn rejects_bad_names() {
        assert!(entry("bad name with spaces").is_err());
        assert!(entry("").is_err());
    }
}
