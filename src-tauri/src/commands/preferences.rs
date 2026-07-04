//! Application preferences: a small, typed key/value store persisted to a JSON
//! file that the Rust side owns.
//!
//! The web front end never touches the file directly. It reads and writes
//! through the [`get_preferences`] and [`set_preferences`] commands on the IPC
//! seam, which are mirrored by typed wrappers in `src/ipc`. The [`Preferences`]
//! struct's JSON shape is mirrored by the `Preferences` interface there; keep
//! them in sync when either changes.
//!
//! Robustness contract: a missing or corrupt store file yields
//! [`Preferences::default`] rather than an error, so the app always boots with
//! usable, typed defaults. Only failures that indicate a genuinely broken
//! environment (e.g. an unresolvable config directory, or a write that cannot
//! complete) surface as errors.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// File name of the preferences store inside the app config directory.
const STORE_FILE_NAME: &str = "preferences.json";

/// The visual theme the user prefers.
///
/// Wiring this to actually switch themes is intentionally out of scope; this
/// is the seeded preference that proves the persistence round trip.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// Light theme (the default).
    #[default]
    Light,
    /// Dark theme.
    Dark,
}

/// The full set of persisted application preferences.
///
/// Every field carries a `serde` default so that older or partially written
/// store files still deserialize: missing keys fall back to their default
/// instead of failing the whole parse. New preferences should follow the same
/// pattern.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct Preferences {
    /// The user's preferred visual theme.
    pub theme: Theme,
}

/// Full path to the store file within the given config directory.
fn store_path(config_dir: &Path) -> PathBuf {
    config_dir.join(STORE_FILE_NAME)
}

/// Loads preferences from the store file in `config_dir`.
///
/// A missing file or one whose contents cannot be parsed yields
/// [`Preferences::default`] - the store is best-effort and never a boot
/// blocker. This is the pure, `AppHandle`-free core that the [`get_preferences`]
/// command delegates to, so it can be unit-tested against a temp directory.
fn load_from_dir(config_dir: &Path) -> Preferences {
    let path = store_path(config_dir);
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Preferences::default(),
    }
}

/// Persists `prefs` to the store file in `config_dir`, creating the directory
/// if needed.
///
/// The pure, `AppHandle`-free core that [`set_preferences`] delegates to.
/// Returns an error only if the directory cannot be created or the file cannot
/// be written; the caller surfaces that to the web side.
fn save_to_dir(config_dir: &Path, prefs: &Preferences) -> Result<(), String> {
    fs::create_dir_all(config_dir)
        .map_err(|e| format!("failed to create config directory: {e}"))?;
    let json = serde_json::to_string_pretty(prefs)
        .map_err(|e| format!("failed to serialize preferences: {e}"))?;
    fs::write(store_path(config_dir), json).map_err(|e| format!("failed to write preferences: {e}"))
}

/// Resolves the platform app config directory for this application.
fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("failed to resolve app config directory: {e}"))
}

/// Reads the persisted preferences, falling back to typed defaults when the
/// store file is missing or corrupt.
#[tauri::command]
pub fn get_preferences(app: AppHandle) -> Result<Preferences, String> {
    Ok(load_from_dir(&config_dir(&app)?))
}

/// Writes the given preferences to the store and echoes back what was saved.
///
/// Returning the saved value keeps the web side's cache authoritative without a
/// follow-up read.
#[tauri::command]
pub fn set_preferences(app: AppHandle, preferences: Preferences) -> Result<Preferences, String> {
    let dir = config_dir(&app)?;
    save_to_dir(&dir, &preferences)?;
    Ok(preferences)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn default_preferences_use_light_theme() {
        assert_eq!(Preferences::default().theme, Theme::Light);
    }

    #[test]
    fn missing_store_file_yields_defaults() {
        let dir = tempdir().unwrap();
        assert_eq!(load_from_dir(dir.path()), Preferences::default());
    }

    #[test]
    fn corrupt_store_file_yields_defaults() {
        let dir = tempdir().unwrap();
        fs::write(store_path(dir.path()), b"{ not valid json").unwrap();
        assert_eq!(load_from_dir(dir.path()), Preferences::default());
    }

    #[test]
    fn partial_store_file_fills_missing_keys_with_defaults() {
        let dir = tempdir().unwrap();
        fs::write(store_path(dir.path()), b"{}").unwrap();
        assert_eq!(load_from_dir(dir.path()), Preferences::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = tempdir().unwrap();
        let prefs = Preferences { theme: Theme::Dark };

        save_to_dir(dir.path(), &prefs).unwrap();

        assert_eq!(load_from_dir(dir.path()), prefs);
    }

    #[test]
    fn save_creates_missing_config_directory() {
        let base = tempdir().unwrap();
        let nested = base.path().join("nested").join("config");
        let prefs = Preferences { theme: Theme::Dark };

        save_to_dir(&nested, &prefs).unwrap();

        assert!(store_path(&nested).exists());
        assert_eq!(load_from_dir(&nested), prefs);
    }

    #[test]
    fn theme_serializes_to_lowercase() {
        let json = serde_json::to_string(&Preferences { theme: Theme::Dark }).unwrap();
        assert_eq!(json, r#"{"theme":"dark"}"#);
    }
}
