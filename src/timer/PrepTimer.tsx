import { DEFAULT_PREP_SECONDS } from "./countdown";
import { EditableTime } from "./EditableTime";
import { useCountdown } from "./useCountdown";

/** A debate side - the timer's own local type so the widget stays self-contained. */
export type TimerSide = "aff" | "neg";

/** Props for {@link PrepTimer}. */
export interface PrepTimerProps {
  /** Which side this prep clock belongs to; drives label and colour. */
  side: TimerSide;
}

/** Per-side presentation, keyed off the shell's aff/neg design tokens. */
const SIDE_STYLES: Record<
  TimerSide,
  { label: string; border: string; text: string; accent: string }
> = {
  aff: {
    label: "Aff",
    border: "border-aff-strong",
    text: "text-aff-strong",
    accent: "bg-aff-soft",
  },
  neg: {
    label: "Neg",
    border: "border-neg-strong",
    text: "text-neg-strong",
    accent: "bg-neg-soft",
  },
};

/**
 * One side's prep-time clock: a 3:00 default countdown ({@link DEFAULT_PREP_SECONDS})
 * with play/pause and reset, coloured by the aff/neg tokens so the two sides
 * read apart at a glance. The time itself is directly editable
 * ({@link EditableTime}), and every control acts only on this timer's own
 * {@link useCountdown} state.
 */
export function PrepTimer({ side }: PrepTimerProps) {
  const styles = SIDE_STYLES[side];
  const countdown = useCountdown(DEFAULT_PREP_SECONDS);

  return (
    <section
      aria-label={`${styles.label} prep timer`}
      data-side={side}
      className={`flex flex-col items-center gap-1 rounded-md border ${styles.border} ${styles.accent} px-2 py-2`}
    >
      <span className={`text-xs font-semibold uppercase tracking-wide ${styles.text}`}>
        {styles.label} prep
      </span>
      <EditableTime
        seconds={countdown.seconds}
        onCommit={countdown.setSeconds}
        label={`${styles.label} prep time`}
        className={`text-2xl font-semibold ${styles.text}`}
      />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={countdown.toggle}
          aria-pressed={countdown.running}
          aria-label={`${countdown.running ? "Pause" : "Play"} ${styles.label} prep timer`}
          className={`rounded border ${styles.border} bg-shell-surface px-2 py-0.5 text-xs font-medium ${styles.text} hover:bg-shell-bg`}
        >
          {countdown.running ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={countdown.reset}
          aria-label={`Reset ${styles.label} prep timer`}
          className={`rounded border ${styles.border} bg-shell-surface px-2 py-0.5 text-xs font-medium ${styles.text} hover:bg-shell-bg`}
        >
          Reset
        </button>
      </div>
    </section>
  );
}
