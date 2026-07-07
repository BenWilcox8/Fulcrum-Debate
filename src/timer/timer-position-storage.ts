/**
 * Local, synchronous persistence for the {@link ./timer-position | timer
 * position} preference.
 *
 * The timer position is per-machine view chrome (like the dock layout and the
 * main window's geometry), so it persists in `localStorage`: synchronous,
 * offline, boot-safe, and out of the shared Yjs types. A debater's "I parked the
 * timer bottom-left" is their reading preference, not a property of any round.
 *
 * Reads normalize through {@link normalizeTimerPosition}, so a missing,
 * unparseable, or malformed stored value degrades to
 * {@link DEFAULT_TIMER_POSITION} rather than throwing. Writes are best-effort: a
 * storage failure (quota, private mode) is swallowed - failing to remember where
 * the timer sits must never surface to the user.
 */
import {
  DEFAULT_TIMER_POSITION,
  normalizeTimerPosition,
  type TimerPosition,
} from "./timer-position";

/** The `localStorage` key the timer position persists under. */
export const TIMER_POSITION_STORAGE_KEY = "fulcrum:timer-position";

/** The subset of the `Storage` API this module needs (so tests can stub it). */
export interface TimerPositionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): TimerPositionStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Accessing localStorage can throw (sandboxed / disabled cookies).
    return null;
  }
}

/**
 * Reads the persisted timer position, normalized to a valid
 * {@link TimerPosition}. Returns {@link DEFAULT_TIMER_POSITION} when nothing is
 * stored, the value is unparseable, or no storage is available.
 */
export function readTimerPosition(
  storage: TimerPositionStorage | null = defaultStorage(),
): TimerPosition {
  if (!storage) return { ...DEFAULT_TIMER_POSITION };
  let raw: string | null;
  try {
    raw = storage.getItem(TIMER_POSITION_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_TIMER_POSITION };
  }
  if (raw === null) return { ...DEFAULT_TIMER_POSITION };
  try {
    return normalizeTimerPosition(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TIMER_POSITION };
  }
}

/**
 * Persists the timer position. Best-effort: any storage failure is swallowed so a
 * failed write never breaks the UI. The value is normalized before writing, so
 * only valid positions are ever stored.
 */
export function writeTimerPosition(
  position: TimerPosition,
  storage: TimerPositionStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      TIMER_POSITION_STORAGE_KEY,
      JSON.stringify(normalizeTimerPosition(position)),
    );
  } catch {
    // Persisting the position is best-effort; ignore quota/permission failures.
  }
}
