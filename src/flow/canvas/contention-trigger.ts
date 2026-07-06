/**
 * The pure keystroke reducer behind the flow sheet's C# contention trigger.
 *
 * Flowing is keyboard-driven: a debater types `C1` in a focused column and a
 * contention container appears, no dialog. Recognising that gesture from a live
 * key stream has two concerns - *accumulating* the typed token and *committing*
 * it - and both are pure state transitions, so they live here apart from the
 * React wiring ({@link ./useContentionTrigger}) that owns the actual listener and
 * calls {@link ../contention#addContention} when this reducer says to fire.
 *
 * The gesture is "type the token, press Enter": Enter is the fluid, unambiguous
 * commit (typing `C12` must not fire at `C1`), and any non-alphanumeric key
 * abandons a half-typed token so stray keys never leave a stale buffer.
 */
import { parseContentionTrigger } from "../contention";

/** The result of feeding one keystroke to the trigger reducer. */
export interface ContentionTriggerStep {
  /** The token buffer after this keystroke (reset to `""` on commit/abandon). */
  readonly buffer: string;
  /**
   * The contention number to create, or `null` for none. Non-null only on an
   * Enter that committed a valid `C#` token; the caller fires the create and the
   * buffer is already cleared.
   */
  readonly create: number | null;
}

/** True for a single printable alphanumeric key (the token alphabet). */
function isTokenKey(key: string): boolean {
  return key.length === 1 && /[A-Za-z0-9]/.test(key);
}

/**
 * Advances the trigger buffer by one keystroke, given the current `buffer` and
 * the pressed `key` (a `KeyboardEvent.key` value).
 *
 * - An alphanumeric key appends to the buffer (still accumulating; `create` is
 *   `null`).
 * - `Enter` commits: if the buffer parses as a contention trigger
 *   ({@link parseContentionTrigger}) it returns that number in `create` and an
 *   empty buffer; otherwise it just clears the buffer.
 * - Any other key (Escape, Space, Backspace, arrows, ...) abandons the token,
 *   resetting the buffer without firing.
 *
 * Pure: the same `(buffer, key)` always yields the same step.
 */
export function stepContentionTrigger(
  buffer: string,
  key: string,
): ContentionTriggerStep {
  if (key === "Enter") {
    return { buffer: "", create: parseContentionTrigger(buffer) };
  }
  if (isTokenKey(key)) {
    return { buffer: buffer + key, create: null };
  }
  return { buffer: "", create: null };
}
