/**
 * Typed IPC bridge to the Rust backend.
 *
 * This is the web half of the command seam: the single place that calls
 * `@tauri-apps/api`'s `invoke`. Feature code imports the typed functions below
 * instead of calling `invoke` directly, so command names, argument shapes, and
 * return types live in exactly one place and stay in sync with the Rust
 * handlers in `src-tauri/src/commands`.
 *
 * To add a command: register the `#[tauri::command]` in the Rust builder, then
 * add a matching typed wrapper here.
 */
import { invoke } from "@tauri-apps/api/core";

/** Reply from the {@link ping} command; mirrors the Rust `Pong` struct. */
export interface Pong {
  message: string;
}

/**
 * Round-trips a message through the Rust `ping` command.
 *
 * Proves the seam end to end: the argument is serialized to Rust and the
 * {@link Pong} response is deserialized back.
 */
export function ping(message: string): Promise<Pong> {
  return invoke<Pong>("ping", { message });
}

/** Returns the native application version reported by the Rust side. */
export function appVersion(): Promise<string> {
  return invoke<string>("app_version");
}

/**
 * Persisted geometry of the main window; mirrors the Rust `WindowGeometry`
 * struct. Coordinates are logical (device-independent) pixels; `x`/`y` are
 * `null` when the window manager should choose placement.
 */
export interface WindowGeometry {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
}

/**
 * Persists the main window's geometry via the Rust side.
 *
 * Called on a debounced resize/move rather than only on exit, so the last
 * geometry survives a force-quit. See `saveWindowGeometry` usage in
 * `src/ipc/window-geometry.ts`.
 */
export function saveWindowGeometry(geometry: WindowGeometry): Promise<void> {
  return invoke<void>("save_window_geometry", { geometry });
}

/** Returns the persisted window geometry, or the Rust-side defaults. */
export function loadWindowGeometry(): Promise<WindowGeometry> {
  return invoke<WindowGeometry>("load_window_geometry");
}
