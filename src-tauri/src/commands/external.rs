//! Opening a URL in the operating system's default handler.
//!
//! This is the Tauri/Rust background boundary for outbound *hand-offs* - the
//! app never speaks a protocol itself, it asks the OS to open a URL with
//! whichever application owns that scheme. The Export feature's Email target
//! uses it to open a `mailto:` draft in the user's mail client, so the draft is
//! composed locally (no network, no account wiring) and the user stays in
//! control of sending. Future export/share targets that hand off to a native
//! app (a share sheet, a browser deep-link) attach here rather than reaching for
//! the network directly.
//!
//! Implemented with `std::process::Command` against the platform opener
//! (`open` on macOS, `xdg-open` on Linux, `cmd /C start` on Windows) so it needs
//! no extra plugin or capability entry - like every app-crate command, it is not
//! gated by the Tauri v2 ACL.

const ALLOWED_SCHEMES: &[&str] = &["mailto:", "https://", "http://"];

fn has_allowed_scheme(url: &str) -> bool {
    let lower = url.to_lowercase();
    ALLOWED_SCHEMES.iter().any(|s| lower.starts_with(s))
}

/// Opens `url` in the operating system's default handler for its scheme.
///
/// Only `mailto:`, `https://`, and `http://` URLs are accepted; any other
/// scheme returns an error without spawning a process.
///
/// Returns `Ok(())` once the opener process has been spawned; an `Err(String)`
/// carries a human-readable reason the web side can surface as export feedback.
/// Spawning succeeds as soon as the OS opener is launched - it does not wait for
/// the target application to finish, so this returns promptly.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !has_allowed_scheme(&url) {
        return Err(format!("URL scheme not permitted: {url}"));
    }
    open_url(&url).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("open").arg(url).spawn()?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn open_url(url: &str) -> std::io::Result<()> {
    std::process::Command::new("xdg-open").arg(url).spawn()?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn open_url(url: &str) -> std::io::Result<()> {
    // `start` is a `cmd` builtin, so it must run through `cmd /C`. The empty
    // first argument is `start`'s optional window-title slot - passing it keeps
    // a quoted URL from being consumed as the title.
    std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn()?;
    Ok(())
}
