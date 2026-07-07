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
 *
 * **The dock fraction is remembered per orientation, not shared across them.** A
 * comfortable *side* width (a fraction of the viewport width) and a comfortable
 * *bottom* height (a fraction of the viewport height) are genuinely different
 * preferences: 40% of the width is a usable side pane, but 40% of the height
 * leaves the flow too short (each column ~one contention tall) with the RFD
 * region crushed beneath it. So the layout stores a {@link DockPosition}-keyed
 * `sizes` map with its own default per edge, and toggling the edge switches to
 * that edge's remembered (or default) fraction rather than carrying the other
 * edge's fraction across.
 */

/** Which edge the speech-doc dock occupies relative to the flow sheet. */
export type DockPosition = "side" | "bottom";

/** The full dock layout preference: the dock's edge and its per-edge fractional size. */
export interface DockLayout {
  /** `"side"` = a vertical split (dock on the right); `"bottom"` = horizontal (dock below). */
  position: DockPosition;
  /**
   * The dock (secondary) pane's fraction of the split axis, **kept per edge** so
   * each orientation remembers a comfortable size independently. `sizes.side` is
   * the dock's fraction of the viewport *width* when side-docked; `sizes.bottom`
   * is its fraction of the viewport *height* when bottom-docked. Each is in
   * `[MIN_DOCK_SIZE, MAX_DOCK_SIZE]`.
   */
  sizes: Record<DockPosition, number>;
}

/** Smallest fraction the dock pane may shrink to, so the flow always stays usable. */
export const MIN_DOCK_SIZE = 0.2;
/** Largest fraction the dock pane may grow to, so the flow is never squeezed out. */
export const MAX_DOCK_SIZE = 0.8;

/**
 * The default dock fraction for each orientation. **Side and bottom differ on
 * purpose:** 40% of the *width* is a comfortable side pane that still leaves the
 * flow ~3 columns wide, but 40% of the *height* makes the flow too short, so the
 * bottom dock defaults lower (30%) - the flow keeps ~70% of the height and the
 * RFD region below it stays usable (see {@link ../../flow/canvas/RfdSection}).
 */
export const DEFAULT_DOCK_SIZES: Record<DockPosition, number> = {
  side: 0.4,
  bottom: 0.3,
};

/**
 * A neutral fraction used when a raw size cannot be coerced (e.g. `NaN`). Not the
 * default for any particular edge - just a valid mid-range fallback.
 */
export const FALLBACK_DOCK_SIZE = DEFAULT_DOCK_SIZES.side;

/** The default layout for a debater who has never adjusted the dock. */
export const DEFAULT_DOCK_LAYOUT: DockLayout = {
  position: "side",
  sizes: { ...DEFAULT_DOCK_SIZES },
};

/** The two valid dock positions, in a stable order (for a toggle/segmented control). */
export const DOCK_POSITIONS: readonly DockPosition[] = ["side", "bottom"];

/** Clamps a raw size into `[MIN_DOCK_SIZE, MAX_DOCK_SIZE]`. */
export function clampDockSize(size: number): number {
  if (!Number.isFinite(size)) return FALLBACK_DOCK_SIZE;
  if (size < MIN_DOCK_SIZE) return MIN_DOCK_SIZE;
  if (size > MAX_DOCK_SIZE) return MAX_DOCK_SIZE;
  return size;
}

/**
 * The clamped dock fraction for the layout's current edge - the single value the
 * {@link ./SplitDock} needs. `position` overrides which edge to read (e.g. to peek
 * at the size an edge would adopt on toggle).
 */
export function dockSizeFor(
  layout: DockLayout,
  position: DockPosition = layout.position,
): number {
  return clampDockSize(layout.sizes[position]);
}

function isDockPosition(value: unknown): value is DockPosition {
  return value === "side" || value === "bottom";
}

/**
 * Reads and clamps the per-edge sizes from arbitrary parsed input. Handles both
 * the current `sizes` map shape and the **legacy single-`size`** shape (written
 * before the per-edge split): a legacy `size` is applied to the layout's stored
 * `position` and the other edge falls back to its default, so an existing stored
 * preference is preserved for the edge the debater actually set it on.
 */
function normalizeSizes(
  record: Record<string, unknown>,
  position: DockPosition,
): Record<DockPosition, number> {
  const raw = record.sizes;
  if (typeof raw === "object" && raw !== null) {
    const map = raw as Record<string, unknown>;
    return {
      side:
        typeof map.side === "number"
          ? clampDockSize(map.side)
          : DEFAULT_DOCK_SIZES.side,
      bottom:
        typeof map.bottom === "number"
          ? clampDockSize(map.bottom)
          : DEFAULT_DOCK_SIZES.bottom,
    };
  }
  if (typeof record.size === "number") {
    const migrated = clampDockSize(record.size);
    return {
      side: position === "side" ? migrated : DEFAULT_DOCK_SIZES.side,
      bottom: position === "bottom" ? migrated : DEFAULT_DOCK_SIZES.bottom,
    };
  }
  return { ...DEFAULT_DOCK_SIZES };
}

/**
 * Coerces arbitrary parsed input (e.g. a JSON blob from local storage that may
 * be malformed or from an older shape) into a valid {@link DockLayout}, falling
 * back to {@link DEFAULT_DOCK_LAYOUT} field-by-field. Never throws, so a corrupt
 * stored value degrades to the default rather than breaking the layout. The
 * legacy single-`size` shape is migrated into the per-edge `sizes` map.
 */
export function normalizeDockLayout(value: unknown): DockLayout {
  if (typeof value !== "object" || value === null) {
    return { position: DEFAULT_DOCK_LAYOUT.position, sizes: { ...DEFAULT_DOCK_SIZES } };
  }
  const record = value as Record<string, unknown>;
  const position = isDockPosition(record.position)
    ? record.position
    : DEFAULT_DOCK_LAYOUT.position;
  return { position, sizes: normalizeSizes(record, position) };
}
