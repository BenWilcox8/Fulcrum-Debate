/**
 * Active-heading derivation - the scroll-tracking half of the ToC sidebar.
 *
 * As the document scrolls, the table of contents highlights the entry for the
 * section currently in view: the heading whose vertical offset is the closest
 * one *at or above* the current scroll position. This module is the pure core of
 * that behaviour - it takes each heading's measured offset and the container's
 * scroll position and returns the single active heading's `pos`. The DOM
 * measurement and scroll wiring live in {@link ./useActiveHeading}, kept
 * separate so this decision is testable without layout (jsdom has none), the
 * same pure-vs-DOM split the flow canvas uses.
 */

/** One heading's vertical offset within the scroll container's content. */
export interface HeadingOffset {
  /**
   * The heading's ProseMirror position (its {@link OutlineHeading.pos}); the
   * stable identifier the ToC rows are keyed by.
   */
  pos: number;
  /**
   * The heading's top offset in pixels, measured from the top of the scroll
   * container's scrollable content (not the viewport) - i.e. the `scrollTop`
   * at which this heading reaches the top of the visible area.
   */
  top: number;
}

/**
 * How many pixels of slack to allow when deciding a heading has reached the top.
 * A heading counts as active once its top is at (or just past) the scroll
 * position; the small tolerance absorbs sub-pixel rounding so a heading scrolled
 * exactly to the top reliably activates.
 */
export const ACTIVE_HEADING_TOLERANCE = 1;

/**
 * Returns the `pos` of the heading that should be highlighted for the given
 * scroll position, or `null` when there are no headings.
 *
 * The active heading is the **closest preceding** one: among headings whose
 * `top` is at or above `scrollTop` (within {@link ACTIVE_HEADING_TOLERANCE}),
 * the one with the greatest `top`. Exactly one heading is ever returned, so only
 * one ToC entry is highlighted at a time. When the document is scrolled above
 * its first heading (nothing precedes the scroll position), the first heading is
 * returned so the topmost section reads as active rather than leaving the whole
 * list unhighlighted.
 *
 * `offsets` is expected in document order but correctness does not depend on it:
 * the greatest qualifying `top` wins regardless of array order.
 */
export function findActiveHeading(
  offsets: readonly HeadingOffset[],
  scrollTop: number,
): number | null {
  if (offsets.length === 0) {
    return null;
  }

  let activePos: number | null = null;
  let activeTop = -Infinity;
  for (const { pos, top } of offsets) {
    if (top <= scrollTop + ACTIVE_HEADING_TOLERANCE && top >= activeTop) {
      activePos = pos;
      activeTop = top;
    }
  }

  // Scrolled above the first heading: nothing precedes, so highlight the
  // topmost section rather than leaving no entry active.
  return activePos ?? offsets[0].pos;
}
