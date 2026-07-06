import { useState } from "react";

import { DEFAULT_SPEECH_SECONDS } from "./countdown";
import { EditableTime } from "./EditableTime";
import { useCountdown } from "./useCountdown";

/**
 * The ordered speech labels the selector cycles through. `>` is not a speech -
 * it is the advance affordance rendered after the labels - so it lives in the
 * component, not this list.
 */
export const SPEECH_OPTIONS = ["AC", "NC", "CX", "AR"] as const;

export type SpeechLabel = (typeof SPEECH_OPTIONS)[number];

/**
 * The dynamic speech timer: one editable countdown whose label is the currently
 * selected speech. The selector row lets a debater click a speech directly, or
 * click `>` to advance to the next speech in order (wrapping past the last back
 * to the first). Selecting or advancing only relabels the running speech - it
 * never touches the countdown - so retiming or switching speeches never
 * interrupts the clock (or, in turn, flowing).
 *
 * The timer's own controls (play/pause, reset) and click-to-edit come from the
 * shared {@link useCountdown} / {@link EditableTime} seams, identical to the
 * prep timers.
 */
export function SpeechTimer() {
  const [selected, setSelected] = useState(0);
  const countdown = useCountdown(DEFAULT_SPEECH_SECONDS);

  const label = SPEECH_OPTIONS[selected];
  const advance = () => setSelected((index) => (index + 1) % SPEECH_OPTIONS.length);

  return (
    <section
      aria-label="Speech timer"
      className="flex flex-col items-center gap-2 rounded-md border border-shell-border bg-shell-surface px-2 py-2"
    >
      <div className="flex items-center gap-2">
        <span
          data-testid="speech-label"
          className="min-w-[2.5rem] rounded bg-shell-bg px-2 py-0.5 text-center text-xs font-semibold uppercase tracking-wide text-shell-text"
        >
          {label}
        </span>
        <EditableTime
          seconds={countdown.seconds}
          onCommit={countdown.setSeconds}
          label="Speech time"
          className="text-2xl font-semibold text-shell-text"
        />
      </div>

      <div
        role="group"
        aria-label="Select speech"
        className="flex items-center gap-1"
      >
        {SPEECH_OPTIONS.map((option, index) => (
          <button
            key={option}
            type="button"
            onClick={() => setSelected(index)}
            aria-pressed={index === selected}
            className={`rounded border px-1.5 py-0.5 text-xs font-medium ${
              index === selected
                ? "border-shell-text bg-shell-text text-shell-surface"
                : "border-shell-border bg-shell-surface text-shell-text hover:bg-shell-bg"
            }`}
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          onClick={advance}
          aria-label="Advance to next speech"
          className="rounded border border-shell-border bg-shell-surface px-1.5 py-0.5 text-xs font-medium text-shell-text hover:bg-shell-bg"
        >
          &gt;
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={countdown.toggle}
          aria-pressed={countdown.running}
          aria-label={`${countdown.running ? "Pause" : "Play"} speech timer`}
          className="rounded border border-shell-border bg-shell-surface px-2 py-0.5 text-xs font-medium text-shell-text hover:bg-shell-bg"
        >
          {countdown.running ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={countdown.reset}
          aria-label="Reset speech timer"
          className="rounded border border-shell-border bg-shell-surface px-2 py-0.5 text-xs font-medium text-shell-text hover:bg-shell-bg"
        >
          Reset
        </button>
      </div>
    </section>
  );
}
