import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { PrepTimer } from "./PrepTimer";
import { SpeechTimer } from "./SpeechTimer";
import { clampFraction, timerOffsetPx, timerPositionFromPointer } from "./timer-position";
import type { TimerPositionStorage } from "./timer-position-storage";
import { useTimerPosition } from "./useTimerPosition";

/** Props for {@link TimerWidget}. */
export interface TimerWidgetProps {
  /**
   * The round's ordered speech labels, forwarded to the {@link SpeechTimer}'s
   * selector so it reflects the actual round structure. Omitted (or empty) falls
   * back to the generic default set - the widget stays self-contained, taking
   * labels as plain data rather than reading any document.
   */
  speeches?: readonly string[];
  /**
   * Storage override for the persisted drag position (tests pass an isolated
   * stub; omit for the real `localStorage`, pass `null` to disable persistence).
   */
  positionStorage?: TimerPositionStorage | null;
}

/**
 * The floating timer widget overlaid on the flow sheet: two side-coloured prep
 * timers and the dynamic speech timer, all self-contained session state.
 *
 * The outer wrapper spans its positioned container but is `pointer-events-none`,
 * so clicks anywhere outside the card pass straight through to the flow beneath.
 * Only the card itself (`pointer-events-auto`) is interactive.
 *
 * **The card is draggable, and never blocks flowing.** The flow is a full-bleed,
 * pannable column grid, so a *fixed* overlay inevitably sits over some column's
 * header + first contention - and on the rightmost column that overlap
 * hard-blocks clicking into it (the audit's D1). So the card floats at a
 * debater-chosen position: grab the "Timers" header bar and drag it to whatever
 * whitespace suits the round, and the placement persists across reloads
 * ({@link useTimerPosition}). That is what makes the widget *float over the flow
 * without blocking flow interactions* per the Flow Sheet Widgets PRD, rather than
 * pinning it where it covers a column.
 *
 * It is also **collapsible** - a debater tucks it into a compact bar to reclaim
 * even the card's own footprint - and defaults expanded (timing is a core need),
 * top-right (its familiar home). Dragging and collapsing compose: the collapsed
 * bar is draggable too.
 */
export function TimerWidget({ speeches, positionStorage }: TimerWidgetProps = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const { position, setPosition } = useTimerPosition(positionStorage);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  // Resolved pixel offset for the card's top-left inside the wrapper, derived
  // from the fractional position and the measured container/card sizes. Null
  // until first measured (before which the card falls back to the top-right pin,
  // so it never flashes at the wrong spot).
  const [offset, setOffset] = useState<{ left: number; top: number } | null>(null);

  // Tracks the previous collapsed state so we can distinguish a collapse-driven
  // card-height change from a genuine container resize.
  const prevCollapsedRef = useRef(collapsed);
  // Tracks the last measured card height so we can reconstruct the on-screen top
  // pixel before a collapse-driven height change occurs.
  const prevCardHeightRef = useRef<number | null>(null);

  // Measure the container + card and resolve the fractional position to pixels.
  // Runs after layout (so refs are populated) and whenever position or collapsed
  // changes; a ResizeObserver keeps it correct as the canvas resizes.
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const card = cardRef.current;
    if (!wrapper || !card) return;

    const collapseToggled = prevCollapsedRef.current !== collapsed;
    prevCollapsedRef.current = collapsed;

    const cw = wrapper.clientWidth;
    const ch = wrapper.clientHeight;
    const cardRect = card.getBoundingClientRect();
    const cardH = cardRect.height;
    const cardW = cardRect.width;

    // When the collapse state toggles, the card height changes but the container
    // does not - re-derive position.y so the card's on-screen top stays constant.
    // A bottom-parked card that grows on expand is clamped to y=1 (shifts up just
    // enough to stay in view). For the default y=0 the math resolves to 0 with no
    // setPosition call, so the top-right path is unchanged.
    if (collapseToggled && prevCardHeightRef.current !== null) {
      const currentTopPx = position.y * Math.max(0, ch - prevCardHeightRef.current);
      const newTravelY = Math.max(0, ch - cardH);
      const newY = newTravelY > 0 ? clampFraction(currentTopPx / newTravelY, 0) : 0;
      prevCardHeightRef.current = cardH;
      if (newY !== position.y) {
        setPosition({ x: position.x, y: newY });
        // position change triggers another effect run that sets up the observer
        return;
      }
    }

    prevCardHeightRef.current = cardH;
    setOffset(timerOffsetPx(position, { width: cw, height: ch }, { width: cardW, height: cardH }));

    const remeasure = () => {
      const rw = wrapper.clientWidth;
      const rh = wrapper.clientHeight;
      const rRect = card.getBoundingClientRect();
      prevCardHeightRef.current = rRect.height;
      setOffset(
        timerOffsetPx(position, { width: rw, height: rh }, { width: rRect.width, height: rRect.height }),
      );
    };

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(remeasure) : null;
    observer?.observe(wrapper);
    observer?.observe(card);
    return () => observer?.disconnect();
  }, [position, collapsed, setPosition]);

  const onDragPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Only the primary button starts a drag; let other pointers (and the
      // collapse button, which stops propagation) behave normally.
      if (event.button !== 0) return;
      const wrapper = wrapperRef.current;
      const card = cardRef.current;
      if (!wrapper || !card) return;

      const cardRect = card.getBoundingClientRect();
      // The pointer's offset within the card, so the card doesn't jump its
      // top-left to the cursor when the drag starts.
      const grab = {
        x: event.clientX - cardRect.left,
        y: event.clientY - cardRect.top,
      };
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();

      const move = (moveEvent: PointerEvent) => {
        const wrapperRect = wrapper.getBoundingClientRect();
        const size = card.getBoundingClientRect();
        setPosition(
          timerPositionFromPointer(
            {
              left: wrapperRect.left,
              top: wrapperRect.top,
              width: wrapper.clientWidth,
              height: wrapper.clientHeight,
            },
            { width: size.width, height: size.height },
            grab,
            { x: moveEvent.clientX, y: moveEvent.clientY },
          ),
        );
      };
      const up = (upEvent: PointerEvent) => {
        handle.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [setPosition],
  );

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none absolute inset-0 z-20"
    >
      <section
        ref={cardRef}
        aria-label="Timers"
        data-collapsed={collapsed ? "true" : undefined}
        style={
          offset
            ? { position: "absolute", left: offset.left, top: offset.top }
            : { position: "absolute", right: 0, top: 0 }
        }
        className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-shell-border bg-shell-surface/95 p-3 shadow-lg backdrop-blur-sm"
      >
        <div
          onPointerDown={onDragPointerDown}
          data-testid="timer-drag-handle"
          title="Drag to move the timer clear of the flow columns"
          className="flex cursor-grab items-center justify-between gap-3 touch-none select-none active:cursor-grabbing"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-shell-muted">
            Timers
          </span>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand timers" : "Collapse timers"}
            title={
              collapsed
                ? "Expand timers"
                : "Collapse timers so the flow beneath is reachable"
            }
            className="rounded border border-shell-border bg-shell-surface px-1.5 py-0.5 text-xs font-medium leading-none text-shell-muted hover:bg-shell-bg hover:text-shell-text"
          >
            {collapsed ? "▾" : "▴"}
          </button>
        </div>
        <div className={collapsed ? "hidden" : "flex flex-col gap-2"} data-testid="timer-body">
          <div className="flex gap-2">
            <PrepTimer side="aff" />
            <PrepTimer side="neg" />
          </div>
          <SpeechTimer speeches={speeches} />
        </div>
      </section>
    </div>
  );
}
