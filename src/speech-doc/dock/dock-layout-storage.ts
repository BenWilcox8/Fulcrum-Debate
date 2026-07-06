/**
 * Local, synchronous persistence for the {@link ./dock-layout | dock layout}
 * preference.
 *
 * The dock layout is per-machine view chrome (like the main window's geometry),
 * so it persists in `localStorage`: a synchronous, offline, boot-safe store that
 * needs no async gate and never awaits the network. This keeps the layout out of
 * the shared Yjs types (which are document content that syncs) - a debater's
 * "dock to the side at 40%" is their reading preference, not a property of any
 * round or speech worth syncing.
 *
 * Reads normalize through {@link normalizeDockLayout}, so a missing, unparseable,
 * or malformed stored value degrades to {@link DEFAULT_DOCK_LAYOUT} rather than
 * throwing. Writes are best-effort: a storage failure (quota, private mode) is
 * swallowed, exactly like {@link ../../ipc/window-geometry | window geometry}
 * persistence - failing to remember a pane size must never surface to the user.
 *
 * The functions take an optional `storage` so tests can drive an isolated stub;
 * they default to `window.localStorage` when available (and no-op when it is
 * not, e.g. a non-DOM context).
 */
import {
  DEFAULT_DOCK_LAYOUT,
  normalizeDockLayout,
  type DockLayout,
} from "./dock-layout";

/** The `localStorage` key the dock layout persists under. */
export const DOCK_LAYOUT_STORAGE_KEY = "fulcrum:dock-layout";

/** The subset of the `Storage` API this module needs (so tests can stub it). */
export interface DockLayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): DockLayoutStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Accessing localStorage can throw (sandboxed / disabled cookies).
    return null;
  }
}

/**
 * Reads the persisted dock layout, normalized to a valid {@link DockLayout}.
 * Returns {@link DEFAULT_DOCK_LAYOUT} when nothing is stored, the value is
 * unparseable, or no storage is available.
 */
export function readDockLayout(
  storage: DockLayoutStorage | null = defaultStorage(),
): DockLayout {
  if (!storage) return { ...DEFAULT_DOCK_LAYOUT };
  let raw: string | null;
  try {
    raw = storage.getItem(DOCK_LAYOUT_STORAGE_KEY);
  } catch {
    return { ...DEFAULT_DOCK_LAYOUT };
  }
  if (raw === null) return { ...DEFAULT_DOCK_LAYOUT };
  try {
    return normalizeDockLayout(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DOCK_LAYOUT };
  }
}

/**
 * Persists the dock layout. Best-effort: any storage failure is swallowed so a
 * failed write never breaks the UI. The value is normalized before writing, so
 * only valid layouts are ever stored.
 */
export function writeDockLayout(
  layout: DockLayout,
  storage: DockLayoutStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      DOCK_LAYOUT_STORAGE_KEY,
      JSON.stringify(normalizeDockLayout(layout)),
    );
  } catch {
    // Persisting the layout is best-effort; ignore quota/permission failures.
  }
}
