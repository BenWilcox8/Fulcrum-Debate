/**
 * The split-screen **dock layout** model - where the Speech Doc editor docks
 * alongside the flow sheet and how big it is.
 *
 * Slice 2/2 of the Speech Doc Editor & Split-Screen Docking PRD: a debater flows
 * on the flow sheet while drafting/reading a speech in the same view, so the
 * speech doc editor docks beside the flow. The debater chooses whether it docks
 * to the **side** (a vertical split) or the **bottom** (a horizontal split), and
 * the split is resizable. This module is the pure model for that choice -
 * React-free and storage-free - so the persistence adapter
 * ({@link ./dock-layout-storage}) and the React hook ({@link ./useDockLayout})
 * both build on one validated shape.
 *
 * The layout is *view chrome*, not document content: it is a per-machine reading
 * preference (like window geometry), so it persists locally (see
 * {@link ./dock-layout-storage}) rather than in the shared Yjs types, and never
 * syncs or conflicts.
 */

/** Which edge the speech-doc dock occupies relative to the flow sheet. */
export type DockPosition = "side" | "bottom";

/** The full dock layout preference: the dock's edge and its fractional size. */
export interface DockLayout {
  /** `"side"` = a vertical split (dock on the right); `"bottom"` = horizontal (dock below). */
  position: DockPosition;
  /**
   * The dock (secondary) pane's fraction of the split axis, in `[MIN, MAX]`.
   * `0.4` means the dock takes 40% (width when side-docked, height when
   * bottom-docked) and the flow takes the remaining 60%.
   */
  size: number;
}

/** Smallest fraction the dock pane may shrink to, so the flow always stays usable. */
export const MIN_DOCK_SIZE = 0.2;
/** Largest fraction the dock pane may grow to, so the flow is never squeezed out. */
export const MAX_DOCK_SIZE = 0.8;

/** The default layout for a debater who has never adjusted the dock. */
export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  position: "side",
  size: 0.4,
};

/** The two valid dock positions, in a stable order (for a toggle/segmented control). */
export const DOCK_POSITIONS: readonly DockPosition[] = ["side", "bottom"];

/** Clamps a raw size into `[MIN_DOCK_SIZE, MAX_DOCK_SIZE]`. */
export function clampDockSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_DOCK_LAYOUT.size;
  if (size < MIN_DOCK_SIZE) return MIN_DOCK_SIZE;
  if (size > MAX_DOCK_SIZE) return MAX_DOCK_SIZE;
  return size;
}

function isDockPosition(value: unknown): value is DockPosition {
  return value === "side" || value === "bottom";
}

/**
 * Coerces arbitrary parsed input (e.g. a JSON blob from local storage that may
 * be malformed or from an older shape) into a valid {@link DockLayout}, falling
 * back to {@link DEFAULT_DOCK_LAYOUT} field-by-field. Never throws, so a corrupt
 * stored value degrades to the default rather than breaking the layout.
 */
export function normalizeDockLayout(value: unknown): DockLayout {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_DOCK_LAYOUT };
  }
  const record = value as Record<string, unknown>;
  const position = isDockPosition(record.position)
    ? record.position
    : DEFAULT_DOCK_LAYOUT.position;
  const size =
    typeof record.size === "number"
      ? clampDockSize(record.size)
      : DEFAULT_DOCK_LAYOUT.size;
  return { position, size };
}
