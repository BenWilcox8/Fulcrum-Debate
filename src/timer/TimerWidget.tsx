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
 */
export function TimerWidget({ speeches }: TimerWidgetProps = {}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-end p-4">
      <section
        aria-label="Timers"
        className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-shell-border bg-shell-surface/95 p-3 shadow-lg backdrop-blur-sm"
      >
        <div className="flex gap-2">
          <PrepTimer side="aff" />
          <PrepTimer side="neg" />
        </div>
        <SpeechTimer speeches={speeches} />
      </section>
    </div>
  );
}
