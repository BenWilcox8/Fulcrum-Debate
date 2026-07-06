import { clampDockSize } from "./dock-layout";
import type { DockPosition } from "./dock-layout";

/** The container's geometry a drag reads to convert a pointer position to a fraction. */
export interface SplitRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The pure geometry behind the resizable divider: given the split container's
 * rect, the dock {@link DockPosition}, and the pointer's client coordinates,
 * returns the dock (secondary) pane's fraction of the split axis, clamped to the
 * valid range.
 *
 * The dock sits on the *far* edge (right when side-docked, bottom when
 * bottom-docked), so its fraction grows as the pointer moves toward the near
 * edge: `(containerFar - pointer) / containerExtent`. Kept pure and
 * DOM-free (it takes a plain rect, not an element) so the resize math is unit
 * tested without a real browser layout - jsdom measures nothing.
 */
export function dockSizeFromPointer(
  rect: SplitRect,
  position: DockPosition,
  clientX: number,
  clientY: number,
): number {
  if (position === "side") {
    if (rect.width <= 0) return clampDockSize(NaN);
    const fraction = (rect.left + rect.width - clientX) / rect.width;
    return clampDockSize(fraction);
  }
  if (rect.height <= 0) return clampDockSize(NaN);
  const fraction = (rect.top + rect.height - clientY) / rect.height;
  return clampDockSize(fraction);
}
