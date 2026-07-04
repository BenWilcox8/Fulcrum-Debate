//! Window geometry persistence.
//!
//! Saves the main window's size and position to a small JSON file in the app
//! config directory so relaunching restores the previous workspace. Saves are
//! driven from the web side on a debounced resize/move (see
//! `src/ipc/window-geometry.ts`), so the last geometry survives a force-quit or
//! crash - there is no reliance on a clean-exit hook.
//!
//! The Rust side owns the on-disk file and is the source of truth for defaults
//! and validation: missing, unreadable, or corrupt state falls back to sane
//! defaults that mirror the window config in `tauri.conf.json`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{LogicalPosition, LogicalSize, Manager, Runtime};

/// Default window size, mirroring the `main` window in `tauri.conf.json`.
const DEFAULT_WIDTH: u32 = 1200;
const DEFAULT_HEIGHT: u32 = 800;

/// Minimum window size, mirroring `minWidth`/`minHeight` in `tauri.conf.json`.
/// A persisted size below this is treated as corrupt.
const MIN_WIDTH: u32 = 800;
const MIN_HEIGHT: u32 = 600;

/// Upper bound on any single dimension / coordinate magnitude. Values beyond
/// this are implausible on real displays and treated as corrupt state.
const MAX_MAGNITUDE: u32 = 32_000;

/// File name for the persisted geometry inside the app config directory.
const GEOMETRY_FILE: &str = "window-geometry.json";

/// Persisted geometry of the main window.
///
/// Position is optional so that on first launch (no saved position) the window
/// manager chooses placement; size always resolves to a concrete default. This
/// is the Rust half of the seam - its shape is mirrored by the `WindowGeometry`
/// interface in `src/ipc`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WindowGeometry {
    /// Logical (device-independent) inner width in pixels.
    pub width: u32,
    /// Logical (device-independent) inner height in pixels.
    pub height: u32,
    /// Logical x of the window's top-left, or `None` to let the OS place it.
    #[serde(default)]
    pub x: Option<i32>,
    /// Logical y of the window's top-left, or `None` to let the OS place it.
    #[serde(default)]
    pub y: Option<i32>,
}

impl Default for WindowGeometry {
    fn default() -> Self {
        Self {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            x: None,
            y: None,
        }
    }
}

impl WindowGeometry {
    /// Returns a geometry with out-of-range values corrected.
    ///
    /// An implausible size (too small, zero, or absurdly large) is treated as
    /// corrupt and collapses to the defaults. An implausible position is simply
    /// dropped so the window manager re-places the window while its size is
    /// preserved.
    fn sanitized(self) -> Self {
        let size_ok = (MIN_WIDTH..=MAX_MAGNITUDE).contains(&self.width)
            && (MIN_HEIGHT..=MAX_MAGNITUDE).contains(&self.height);
        if !size_ok {
            return Self::default();
        }

        let position_ok = |v: Option<i32>| match v {
            Some(v) => v.unsigned_abs() <= MAX_MAGNITUDE,
            None => true,
        };
        let (x, y) = if position_ok(self.x) && position_ok(self.y) {
            (self.x, self.y)
        } else {
            (None, None)
        };

        Self {
            width: self.width,
            height: self.height,
            x,
            y,
        }
    }
}

/// Parses geometry from JSON, falling back to defaults on any parse error.
///
/// Pure and self-contained so it can be unit-tested without a webview.
fn parse_geometry(contents: &str) -> WindowGeometry {
    serde_json::from_str::<WindowGeometry>(contents)
        .map(WindowGeometry::sanitized)
        .unwrap_or_default()
}

/// Loads geometry from `path`, returning defaults if the file is missing,
/// unreadable, or corrupt.
fn load_from_path(path: &Path) -> WindowGeometry {
    match std::fs::read_to_string(path) {
        Ok(contents) => parse_geometry(&contents),
        Err(_) => WindowGeometry::default(),
    }
}

/// Writes `geometry` to `path` as pretty JSON, creating parent dirs as needed.
fn save_to_path(path: &Path, geometry: &WindowGeometry) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json =
        serde_json::to_string_pretty(geometry).expect("WindowGeometry always serializes to JSON");
    std::fs::write(path, json)
}

/// Resolves the geometry file path inside the app config directory.
fn geometry_path<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(GEOMETRY_FILE))
        .map_err(|err| err.to_string())
}

/// Persists the main window's geometry to disk.
///
/// Called from the web side (debounced on resize/move) through the typed IPC
/// seam, so geometry is captured continuously rather than only on exit.
#[tauri::command]
pub fn save_window_geometry<R: Runtime>(
    app: tauri::AppHandle<R>,
    geometry: WindowGeometry,
) -> Result<(), String> {
    let path = geometry_path(&app)?;
    save_to_path(&path, &geometry.sanitized()).map_err(|err| err.to_string())
}

/// Returns the persisted geometry, or defaults when none is stored yet.
#[tauri::command]
pub fn load_window_geometry<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<WindowGeometry, String> {
    let path = geometry_path(&app)?;
    Ok(load_from_path(&path))
}

/// Applies the persisted geometry to the main window at startup.
///
/// Runs in the Tauri `setup` hook before the window is shown, so the window
/// opens at its restored size/position without a visible jump. Failures are
/// non-fatal: a missing/corrupt file yields defaults and any window API error
/// is ignored so the app still launches.
pub fn restore<R: Runtime>(app: &tauri::AppHandle<R>) {
    let geometry = match geometry_path(app) {
        Ok(path) => load_from_path(&path),
        Err(_) => WindowGeometry::default(),
    };

    match app.get_webview_window("main") {
        Some(window) => {
            let _ = window.set_size(LogicalSize::new(geometry.width, geometry.height));
            if let (Some(x), Some(y)) = (geometry.x, geometry.y) {
                let _ = window.set_position(LogicalPosition::new(x, y));
            }
            let _ = window.show();
        }
        None => {
            for (_, window) in app.webview_windows() {
                let _ = window.show();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A unique, non-existent temp path for round-trip tests without pulling in
    /// a tempfile crate.
    fn unique_temp_path() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "fulcrum-winstate-{}-{}-{}.json",
            std::process::id(),
            n,
            GEOMETRY_FILE
        ))
    }

    #[test]
    fn parses_a_full_geometry() {
        let geometry = parse_geometry(r#"{"width":1000,"height":700,"x":40,"y":25}"#);
        assert_eq!(
            geometry,
            WindowGeometry {
                width: 1000,
                height: 700,
                x: Some(40),
                y: Some(25),
            }
        );
    }

    #[test]
    fn parses_geometry_without_a_position() {
        let geometry = parse_geometry(r#"{"width":1000,"height":700}"#);
        assert_eq!(geometry.width, 1000);
        assert_eq!(geometry.height, 700);
        assert_eq!(geometry.x, None);
        assert_eq!(geometry.y, None);
    }

    #[test]
    fn corrupt_json_falls_back_to_default() {
        assert_eq!(parse_geometry("not json at all"), WindowGeometry::default());
        assert_eq!(parse_geometry(""), WindowGeometry::default());
    }

    #[test]
    fn undersized_geometry_falls_back_to_default() {
        // Below the configured minimum window size -> treated as corrupt.
        let geometry = parse_geometry(r#"{"width":10,"height":10,"x":0,"y":0}"#);
        assert_eq!(geometry, WindowGeometry::default());
    }

    #[test]
    fn absurd_size_falls_back_to_default() {
        let geometry = parse_geometry(r#"{"width":9000000,"height":800}"#);
        assert_eq!(geometry, WindowGeometry::default());
    }

    #[test]
    fn absurd_position_is_dropped_but_size_is_kept() {
        let geometry = parse_geometry(r#"{"width":1000,"height":700,"x":9000000,"y":0}"#);
        assert_eq!(geometry.width, 1000);
        assert_eq!(geometry.height, 700);
        assert_eq!(geometry.x, None);
        assert_eq!(geometry.y, None);
    }

    #[test]
    fn missing_file_loads_default() {
        let path = unique_temp_path();
        assert!(!path.exists());
        assert_eq!(load_from_path(&path), WindowGeometry::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        let path = unique_temp_path();
        let geometry = WindowGeometry {
            width: 1024,
            height: 768,
            x: Some(-30),
            y: Some(15),
        };

        save_to_path(&path, &geometry).expect("save succeeds");
        let loaded = load_from_path(&path);
        std::fs::remove_file(&path).ok();

        assert_eq!(loaded, geometry);
    }
}
