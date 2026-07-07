/**
 * Local, synchronous persistence for the **last-used SpeechDrop room code**.
 *
 * A room code is per-machine convenience state (like the {@link
 * ../speech-doc/dock/dock-layout-storage | dock layout} and the window
 * geometry), not shared document content, so it persists in `localStorage`: the
 * next export pre-fills the last code the debater used on this machine, saving a
 * re-type when they upload several documents to the same round's room. It is
 * deliberately kept out of the shared Yjs types (it would only sync noise between
 * machines) and out of the Rust preference store (that store is a fixed-shape
 * app-settings struct; this is transient chrome).
 *
 * Reads degrade to `null` (no pre-fill) on a missing/blocked store; writes are
 * best-effort and swallow failures - failing to remember a room code must never
 * surface to the user.
 */

/** The `localStorage` key the last room code persists under. */
export const SPEECHDROP_ROOM_STORAGE_KEY = "fulcrum:speechdrop-room";

/** The subset of the `Storage` API this module needs (so tests can stub it). */
export interface SpeechDropRoomStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SpeechDropRoomStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Accessing localStorage can throw (sandboxed / disabled cookies).
    return null;
  }
}

/**
 * Reads the last-used room code, or `null` when none is stored (or no storage is
 * available). A stored empty string reads back as `null`.
 */
export function readLastRoomCode(
  storage: SpeechDropRoomStorage | null = defaultStorage(),
): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SPEECHDROP_ROOM_STORAGE_KEY);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * Persists the last-used room code. Best-effort: storage failures are swallowed.
 * An empty/whitespace code is ignored (nothing worth remembering).
 */
export function writeLastRoomCode(
  code: string,
  storage: SpeechDropRoomStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  const trimmed = code.trim();
  if (trimmed === "") return;
  try {
    storage.setItem(SPEECHDROP_ROOM_STORAGE_KEY, trimmed);
  } catch {
    // Persisting the room code is best-effort; ignore quota/permission failures.
  }
}
