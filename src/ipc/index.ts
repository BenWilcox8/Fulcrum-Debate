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
