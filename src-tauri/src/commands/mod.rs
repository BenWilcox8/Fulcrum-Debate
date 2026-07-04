//! Tauri command handlers exposed to the web front end.
//!
//! This module is the Rust half of the IPC seam. Every command that the web
//! side can invoke lives here (or in a submodule re-exported here) and is
//! registered in the Tauri builder via `generate_handler!` in `lib.rs`. Future
//! background work (scraping, file processing) attaches by adding commands to
//! this module rather than touching the builder wiring elsewhere.
//!
//! Commands defined in the app crate are not gated by the Tauri v2 ACL - only
//! plugin/core commands need capability permission entries - so adding a new
//! `#[tauri::command]` here requires no change to `capabilities/default.json`.

use serde::Serialize;

/// Reply returned by [`ping`].
///
/// Serialized to JSON on the way back to the web side; its shape is mirrored by
/// the `Pong` interface in `src/ipc`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Pong {
    /// Echoed acknowledgement of the caller's message.
    pub message: String,
}

/// Trivial round-trip command that proves the web <-> Rust IPC seam end to end.
///
/// Takes a message from the web side and returns it wrapped in a [`Pong`],
/// exercising both argument deserialization and response serialization.
#[tauri::command]
pub fn ping(message: String) -> Pong {
    Pong {
        message: format!("pong: {message}"),
    }
}

/// Returns the native application version compiled into the binary.
///
/// A no-argument command, useful as a smoke test of the seam from the web side.
#[tauri::command]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ping_wraps_the_message() {
        assert_eq!(
            ping("hello".to_string()),
            Pong {
                message: "pong: hello".to_string(),
            }
        );
    }

    #[test]
    fn app_version_reports_the_crate_version() {
        assert_eq!(app_version(), env!("CARGO_PKG_VERSION"));
    }
}
