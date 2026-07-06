/**
 * Pure time helpers shared by every timer surface. Kept free of React so the
 * formatting/parsing contract (the seam click-to-edit relies on) is testable in
 * isolation and never drifts between the prep and speech timers.
 */

/** Default starting time for a prep timer: 3 minutes, per the PRD. */
export const DEFAULT_PREP_SECONDS = 180;

/**
 * Default starting time for the speech timer. Debate speech lengths vary by
 * format, and every timer value is directly editable, so this is only a
 * sensible starting point a debater overrides per round - not a fixed rule.
 */
export const DEFAULT_SPEECH_SECONDS = 300;

/**
 * Format a whole-second count as `M:SS` (minutes are never zero-padded, seconds
 * always are). Negative or fractional inputs are floored and clamped to 0, so a
 * countdown that reaches its floor renders `0:00` rather than a negative time.
 */
export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Parse a user-typed timer value into whole seconds, or `null` when the input
 * is not a recognisable time (the caller keeps the prior value on `null`).
 *
 * Accepts `M:SS` / `MM:SS` (seconds must be 0-59) or a bare number of seconds;
 * surrounding whitespace is trimmed. This is the inverse of {@link formatTime}
 * for any value it produces, so a debater can retype exactly what they see.
 */
export function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    if (parts.length !== 2) return null;
    const [minutePart, secondPart] = parts;
    if (!/^\d+$/.test(minutePart) || !/^\d+$/.test(secondPart)) return null;
    const seconds = Number(secondPart);
    if (seconds > 59) return null;
    return Number(minutePart) * 60 + seconds;
  }

  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
