import { useState } from "react";

import { PrepTimer } from "./PrepTimer";
import { SpeechTimer } from "./SpeechTimer";

/** Props for {@link TimerWidget}. */
export interface TimerWidgetProps {
  /**
   * The round's ordered speech labels, forwarded to the {@link SpeechTimer}'s
   * selector so it reflects the actual round structure. Omitted (or empty) falls
   * back to the generic default set - the widget stays self-contained, taking
   * labels as plain data rather than reading any document.
   */
  speeches?: readonly string[];
}

/**
 * The floating timer widget overlaid on the flow sheet: two side-coloured prep
 * timers and the dynamic speech timer, all self-contained session state.
 *
 * The outer wrapper spans its positioned container but is `pointer-events-none`,
 * so clicks anywhere outside the card pass straight through to the flow beneath -
 * the widget floats over the flow without blocking or interrupting flowing. Only
 * the card itself (`pointer-events-auto`) is interactive. The caller positions
 * this inside a `relative` container; the wrapper pins the card to the top-right.
 *
 * Because the card is pinned to the top-right and columns grow downward from the
 * top, an *expanded* card sits over the first contention of whichever columns it
 * overlaps - unavoidable for any fixed overlay on a column grid, and acute at
 * narrow widths where those columns are packed tight. So the card is
 * **collapsible**: a debater tucks it into a compact bar to reach a contention
 * beneath it, and expands it again to time. It defaults expanded (timing is a
 * core need) but never permanently obstructs the flow.
 */
export function TimerWidget({ speeches }: TimerWidgetProps = {}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-end p-4">
      <section
        aria-label="Timers"
        data-collapsed={collapsed ? "true" : undefined}
        className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-shell-border bg-shell-surface/95 p-3 shadow-lg backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-shell-muted">
            Timers
          </span>
          <button
            type="button"
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
