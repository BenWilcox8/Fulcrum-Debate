import {
  useCallback,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import {
  MAX_DOCK_SIZE,
  MIN_DOCK_SIZE,
  clampDockSize,
  type DockPosition,
} from "./dock-layout";
import { dockSizeFromPointer } from "./split-drag";

/** How much one arrow-key press nudges the divider (fraction of the split axis). */
const KEYBOARD_STEP = 0.02;

/** Props for {@link SplitDock}. */
export interface SplitDockProps {
  /** Which edge the dock (secondary) pane occupies. */
  position: DockPosition;
  /** The dock pane's fraction of the split axis, in `[MIN_DOCK_SIZE, MAX_DOCK_SIZE]`. */
  size: number;
  /** Commits a new dock fraction as the divider is dragged / keyed. */
  onSizeChange: (size: number) => void;
  /** The main (flow) pane - takes the remaining space. */
  primary: ReactNode;
  /** The dock (speech) pane - sized to `size` along the split axis. */
  secondary: ReactNode;
  /** Accessible label for the divider (defaults to a generic one). */
  dividerLabel?: string;
  /** Class applied to the split container. */
  className?: string;
}

/**
 * A two-pane resizable split. The `primary` (flow sheet) fills the remaining
 * space and the `secondary` (docked speech editor) takes `size` along the split
 * axis, on the edge chosen by `position` - the right for `"side"` (a vertical
 * split, `flex-row`) or the bottom for `"bottom"` (a horizontal split,
 * `flex-col`). A draggable divider between them reports new fractions through
 * `onSizeChange`; the caller owns and persists the value.
 *
 * The divider is a real `role="separator"` with `aria-valuenow`/min/max and
 * arrow-key support, so resizing is keyboard-operable too. Pointer capture on
 * the divider means a drag keeps tracking even when the pointer outruns it.
 *
 * Both panes are `min-w-0 min-h-0` so a flex child can actually shrink (and so
 * the flow's XYFlow canvas measures a definite size and reflows on resize rather
 * than overflowing) - the flow keeps every interaction while docked.
 */
export function SplitDock({
  position,
  size,
  onSizeChange,
  primary,
  secondary,
  dividerLabel = "Resize speech dock",
  className,
}: SplitDockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const side = position === "side";
  const clamped = clampDockSize(size);
  const secondaryBasis = `${(clamped * 100).toFixed(4)}%`;

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      onSizeChange(
        dockSizeFromPointer(rect, position, event.clientX, event.clientY),
      );
    },
    [onSizeChange, position],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Capture so the drag keeps tracking past the divider's own bounds.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const handlePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // Grow-dock = toward the near edge: Left/Up for side, Left/Up for bottom.
      let delta = 0;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        delta = KEYBOARD_STEP;
      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        delta = -KEYBOARD_STEP;
      } else {
        return;
      }
      event.preventDefault();
      onSizeChange(clampDockSize(clamped + delta));
    },
    [clamped, onSizeChange],
  );

  return (
    <div
      ref={containerRef}
      data-testid="split-dock"
      data-dock-position={position}
      className={`flex min-h-0 min-w-0 ${side ? "flex-row" : "flex-col"} ${
        className ?? ""
      }`}
    >
      <div className="min-h-0 min-w-0 flex-1">{primary}</div>
      <div
        role="separator"
        aria-orientation={side ? "vertical" : "horizontal"}
        aria-label={dividerLabel}
        aria-valuemin={Math.round(MIN_DOCK_SIZE * 100)}
        aria-valuemax={Math.round(MAX_DOCK_SIZE * 100)}
        aria-valuenow={Math.round(clamped * 100)}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKeyDown}
        className={
          side
            ? "w-1.5 shrink-0 cursor-col-resize bg-shell-border hover:bg-shell-muted focus-visible:bg-shell-muted focus-visible:outline-none"
            : "h-1.5 shrink-0 cursor-row-resize bg-shell-border hover:bg-shell-muted focus-visible:bg-shell-muted focus-visible:outline-none"
        }
      />
      <div
        className="min-h-0 min-w-0 shrink-0 grow-0 overflow-hidden"
        style={side ? { width: secondaryBasis } : { height: secondaryBasis }}
      >
        {secondary}
      </div>
    </div>
  );
}
