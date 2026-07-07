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

/**
 * Whether the Tauri IPC bridge is present - i.e. we are running inside the
 * desktop shell rather than a plain browser (the dev server, a webview preview,
 * or the E2E harness). Tauri injects `__TAURI_INTERNALS__` onto `window`; without
 * it, `invoke` dereferences `undefined` and throws a raw
 * `Cannot read properties of undefined (reading 'invoke')` TypeError.
 *
 * The outbound-hand-off commands ({@link openExternal}, {@link uploadToSpeechDrop})
 * guard on this so that in a browser they reject with a readable, user-facing
 * reason instead of leaking that internal TypeError to the export failure line.
 */
export function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The friendly reason surfaced when an OS/network hand-off is attempted outside the desktop app. */
const NO_TAURI_MESSAGE =
  "This action is only available in the Fulcrum desktop app.";

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
  if (!isTauriAvailable()) return Promise.reject(new Error(NO_TAURI_MESSAGE));
  return invoke<void>("open_external", { url });
}

/**
 * A file upload to a SpeechDrop room; mirrors the Rust `SpeechDropUploadRequest`
 * struct. The content is base64-encoded so the seam is binary-safe.
 */
export interface SpeechDropUploadRequest {
  /** The room code the debater entered. */
  roomCode: string;
  /** The file name presented to SpeechDrop (e.g. `"Speech.rtf"`). */
  fileName: string;
  /** The upload MIME type (must be one SpeechDrop accepts, e.g. `"text/rtf"`). */
  contentType: string;
  /** The file bytes, base64-encoded. */
  contentBase64: string;
}

/**
 * Uploads a document to a SpeechDrop room via the Rust `speechdrop_upload`
 * command.
 *
 * This is the outbound *network* boundary the Export feature's SpeechDrop target
 * uses: the app never speaks SpeechDrop's CSRF-protected upload protocol from the
 * webview - it hands the room code + file to Rust, which primes the session and
 * uploads over a fixed, host-locked base URL (the network analogue of
 * {@link openExternal}'s scheme allowlist). Rejects with the Rust-side message
 * for every expected failure (bad room code, unreachable host, room not found,
 * rejected file) so the target can surface it as feedback.
 */
export function uploadToSpeechDrop(
  request: SpeechDropUploadRequest,
): Promise<void> {
  if (!isTauriAvailable()) return Promise.reject(new Error(NO_TAURI_MESSAGE));
  return invoke<void>("speechdrop_upload", { request });
}
