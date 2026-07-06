import { useEffect, useRef, useState } from "react";

import { formatTime, parseTime } from "./countdown";

/** Props for {@link EditableTime}. */
export interface EditableTimeProps {
  /** The remaining seconds to display. */
  seconds: number;
  /** Commit a parsed edit back to the owning countdown. */
  onCommit(seconds: number): void;
  /** Accessible name for both the display button and the edit field. */
  label: string;
  /** Extra classes for the display/edit element (fonts, colour). */
  className?: string;
}

/**
 * A directly-editable timer value: it shows the formatted time as a button, and
 * a click turns it into a text field seeded with the same `M:SS` string. Enter
 * (or blur) parses the field via {@link parseTime} and commits the new time
 * through `onCommit`, so the edit takes effect on the live countdown; Escape or
 * an unparseable value discards the edit and keeps the prior time.
 *
 * Editing is purely local UI state - it never pauses or resumes the countdown,
 * so retiming mid-round does not interrupt anything else.
 */
export function EditableTime({
  seconds,
  onCommit,
  label,
  className,
}: EditableTimeProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const beginEdit = () => {
    setDraft(formatTime(seconds));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseTime(draft);
    if (parsed !== null) onCommit(parsed);
    setEditing(false);
  };

  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        ref={inputRef}
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        className={`w-full bg-transparent text-center tabular-nums outline-none ${className ?? ""}`}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={beginEdit}
      className={`tabular-nums ${className ?? ""}`}
    >
      {formatTime(seconds)}
    </button>
  );
}
