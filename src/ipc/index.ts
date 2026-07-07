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

/** Visual theme preference; mirrors the Rust `Theme` enum (lowercase). */
export type Theme = "light" | "dark";

/**
 * The full set of persisted application preferences; mirrors the Rust
 * `Preferences` struct. Keep the two in sync when either changes.
 */
export interface Preferences {
  theme: Theme;
}

/**
 * Typed defaults used before the persisted store has loaded, and as the
 * canonical fallback shape. Mirrors `Preferences::default` on the Rust side so
 * both halves of the seam agree on the starting state without a network or
 * disk round trip.
 */
export const DEFAULT_PREFERENCES: Preferences = { theme: "light" };

/**
 * Reads the persisted preferences from the Rust-owned store.
 *
 * A missing or corrupt store resolves to typed defaults on the Rust side, so
 * this never rejects for those cases.
 */
export function getPreferences(): Promise<Preferences> {
  return invoke<Preferences>("get_preferences");
}

/** Persists `preferences` to the store and resolves with what was saved. */
export function setPreferences(preferences: Preferences): Promise<Preferences> {
  return invoke<Preferences>("set_preferences", { preferences });
}

/**
 * Hands `url` to the operating system's default handler for its scheme via the
 * Rust `open_external` command.
 *
 * This is the outbound hand-off boundary the Export feature's Email target uses
 * to open a `mailto:` draft in the user's mail client: the app never speaks a
 * protocol itself, it asks the OS to open the URL, so the draft is composed
 * locally and the user stays in control of sending. Rejects with the Rust-side
 * error string when the opener could not be launched, so a caller can surface a
 * failure. Resolves once the opener process is spawned - not when the target
 * application finishes.
 */
export function openExternal(url: string): Promise<void> {
  return invoke<void>("open_external", { url });
}
