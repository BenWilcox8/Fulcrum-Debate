import { useState } from "react";

import { DEFAULT_SPEECH_SECONDS } from "./countdown";
import { EditableTime } from "./EditableTime";
import { useCountdown } from "./useCountdown";

/**
 * The default speech labels the selector cycles through when a caller supplies
 * no round-specific set - a generic Policy/LD shorthand (Aff/Neg Constructive,
 * Cross-Ex, Aff Rebuttal). `>` is not a speech - it is the advance affordance
 * rendered after the labels - so it lives in the component, not this list.
 *
 * When the timer is mounted for a real round, the caller passes that round's
 * actual speech labels via {@link SpeechTimerProps.speeches} (e.g. the flow
 * sheet's column labels), so a Public-Forum or any non-Policy round shows its
 * own speeches ("Con Case", "Pro FF", ...) rather than these placeholders.
 */
export const SPEECH_OPTIONS = ["AC", "NC", "CX", "AR"] as const;

export type SpeechLabel = (typeof SPEECH_OPTIONS)[number];

/** Props for {@link SpeechTimer}. */
export interface SpeechTimerProps {
  /**
   * The ordered speech labels this timer can time - typically the round's own
   * flow-sheet column labels, so the selector reflects the actual round
   * structure. Empty or omitted falls back to {@link SPEECH_OPTIONS}, keeping
   * the widget self-contained (it takes labels as plain data, never a document
   * handle) and usable standalone.
   */
  speeches?: readonly string[];
}

/**
 * The dynamic speech timer: one editable countdown whose label is the currently
 * selected speech. The selector row lets a debater click a speech directly, or
 * click `>` to advance to the next speech in order (wrapping past the last back
 * to the first). Selecting or advancing only relabels the running speech - it
 * never touches the countdown - so retiming or switching speeches never
 * interrupts the clock (or, in turn, flowing).
 *
 * The set of selectable speeches is {@link SpeechTimerProps.speeches} when a
 * caller supplies one (the round's real speeches) and {@link SPEECH_OPTIONS}
 * otherwise, so the selector labels stay meaningful for any round format.
 *
 * The timer's own controls (play/pause, reset) and click-to-edit come from the
 * shared {@link useCountdown} / {@link EditableTime} seams, identical to the
 * prep timers.
 */
export function SpeechTimer({ speeches }: SpeechTimerProps = {}) {
  const [selected, setSelected] = useState(0);
  const countdown = useCountdown(DEFAULT_SPEECH_SECONDS);

  const options = speeches && speeches.length > 0 ? speeches : SPEECH_OPTIONS;
  // The round's speeches can change (a column added / removed / reordered) while
  // a selection is held, so clamp the live index into range rather than index
  // out of bounds.
  const activeIndex = selected < options.length ? selected : 0;
  const label = options[activeIndex];
  const advance = () =>
    setSelected((index) => ((index < options.length ? index : 0) + 1) % options.length);

  return (
    <section
      aria-label="Speech timer"
      className="flex flex-col items-center gap-2 rounded-md border border-shell-border bg-shell-surface px-2 py-2"
    >
      <div className="flex items-center gap-2">
        <span
          data-testid="speech-label"
          title={label}
          className="min-w-[2.5rem] max-w-[8rem] truncate rounded bg-shell-bg px-2 py-0.5 text-center text-xs font-semibold uppercase tracking-wide text-shell-text"
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
        className="flex max-w-[16rem] flex-wrap items-center justify-center gap-1"
      >
        {options.map((option, index) => (
          <button
            key={`${index}-${option}`}
            type="button"
            onClick={() => setSelected(index)}
            aria-pressed={index === activeIndex}
            title={option}
            className={`max-w-[7rem] truncate rounded border px-1.5 py-0.5 text-xs font-medium ${
              index === activeIndex
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
