/**
 * The floating **timer position** model - where the timer card rests on the flow
 * canvas.
 *
 * The timer floats over the flow, and the PRD's promise is that it does so
 * *without blocking flowing*. A fixed top-right pin cannot honour that: the flow
 * is a full-bleed, pannable column grid, so any fixed overlay sits over some
 * column's header and first contention - and on the rightmost column that
 * overlap hard-blocks clicking into it. The fix is to let the debater **drag the
 * widget** to whatever whitespace suits them, and remember that choice. This
 * module is the pure, React-free, storage-free model for that position, so the
 * persistence adapter ({@link ./timer-position-storage}) and the React hook
 * ({@link ./useTimerPosition}) build on one validated shape.
 *
 * The position is a **fraction** of the card's available travel on each axis, not
 * absolute pixels: `x`/`y` in `[0, 1]` map the card's top-left across
 * `containerSize - cardSize`, so `{x: 1, y: 0}` pins the card to the top-right
 * corner (its familiar default) and the placement stays sensible as the canvas
 * resizes. Fractions keep the stored value viewport-independent, exactly like the
 * dock layout stores a fractional split size rather than pixels.
 *
 * Like the dock layout, the timer position is per-machine view chrome (not
 * document content), so it persists locally and never enters the shared Yjs
 * types.
 */

/** The timer card's resting position as a fraction of its travel on each axis. */
export interface TimerPosition {
  /** Horizontal fraction in `[0, 1]`: `0` = flush left, `1` = flush right. */
  x: number;
  /** Vertical fraction in `[0, 1]`: `0` = flush top, `1` = flush bottom. */
  y: number;
}

/** The default resting position: top-right, the timer's familiar home. */
export const DEFAULT_TIMER_POSITION: TimerPosition = { x: 1, y: 0 };

/** Clamps a single axis fraction into `[0, 1]`, defaulting a non-finite value. */
export function clampFraction(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Clamps a raw position so both axes sit in `[0, 1]`. */
export function clampTimerPosition(position: TimerPosition): TimerPosition {
  return {
    x: clampFraction(position.x, DEFAULT_TIMER_POSITION.x),
    y: clampFraction(position.y, DEFAULT_TIMER_POSITION.y),
  };
}

/**
 * Coerces arbitrary parsed input (e.g. a JSON blob from local storage that may be
 * malformed or from an older shape) into a valid {@link TimerPosition}, falling
 * back to {@link DEFAULT_TIMER_POSITION} field-by-field. Never throws, so a
 * corrupt stored value degrades to the default rather than breaking the widget.
 */
export function normalizeTimerPosition(value: unknown): TimerPosition {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_TIMER_POSITION };
  }
  const record = value as Record<string, unknown>;
  const x =
    typeof record.x === "number"
      ? clampFraction(record.x, DEFAULT_TIMER_POSITION.x)
      : DEFAULT_TIMER_POSITION.x;
  const y =
    typeof record.y === "number"
      ? clampFraction(record.y, DEFAULT_TIMER_POSITION.y)
      : DEFAULT_TIMER_POSITION.y;
  return { x, y };
}

/** A rectangle - the drag container's measured bounds. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A width/height pair - the dragged card's measured size. */
export interface Size {
  width: number;
  height: number;
}

/**
 * The pure drag math: given the container's bounds, the card's size, the pointer
 * offset *within* the card that the drag grabbed (so the card doesn't jump its
 * top-left to the cursor), and the current pointer position, returns the new
 * fractional {@link TimerPosition}.
 *
 * The card's desired top-left in container coordinates is
 * `pointer - containerOrigin - grab`; dividing by the available travel
 * (`containerSize - cardSize`) yields the fraction, clamped to `[0, 1]` so the
 * card can never be dragged out of view. When an axis has no travel (the card is
 * at least as large as the container), that axis collapses to `0`.
 *
 * Kept pure and position-only (jsdom measures nothing, so this is unit-tested
 * without a browser, exactly like the dock's `dockSizeFromPointer`).
 */
export function timerPositionFromPointer(
  container: Rect,
  card: Size,
  grab: { x: number; y: number },
  pointer: { x: number; y: number },
): TimerPosition {
  const travelX = container.width - card.width;
  const travelY = container.height - card.height;
  const leftPx = pointer.x - container.left - grab.x;
  const topPx = pointer.y - container.top - grab.y;
  return {
    x: travelX > 0 ? clampFraction(leftPx / travelX, 0) : 0,
    y: travelY > 0 ? clampFraction(topPx / travelY, 0) : 0,
  };
}

/**
 * Resolves a fractional {@link TimerPosition} to concrete `left`/`top` pixel
 * offsets for the card inside a container of the given size, given the card's
 * measured size. The inverse of {@link timerPositionFromPointer}'s fraction, used
 * at render time to place the card.
 */
export function timerOffsetPx(
  position: TimerPosition,
  container: Size,
  card: Size,
): { left: number; top: number } {
  const travelX = Math.max(0, container.width - card.width);
  const travelY = Math.max(0, container.height - card.height);
  return {
    left: position.x * travelX,
    top: position.y * travelY,
  };
}
