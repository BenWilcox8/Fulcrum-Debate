/**
 * The pure keystroke reducer behind the flow sheet's S# subpoint trigger.
 *
 * Flowing is keyboard-driven: a debater types `S1` *inside a contention* and a
 * nested subpoint container appears, no dialog. This mirrors the C# contention
 * reducer ({@link ./contention-trigger}) - accumulating the typed token and
 * committing it are both pure state transitions, kept here apart from the React
 * wiring ({@link ./useSubpointTrigger}) that owns the actual editor listener and
 * calls {@link ../subpoint#addSubpoint} when this reducer says to fire.
 *
 * The gesture is "type the token, press Enter": Enter is the fluid, unambiguous
 * commit (typing `S12` must not fire at `S1`), and any non-alphanumeric key
 * abandons a half-typed token so stray keys never leave a stale buffer. Because
 * the trigger lives on an *editable* surface, the caller also uses the committed
 * buffer's length to strip the just-typed token from the editor; this reducer
 * itself stays a pure `(buffer, key) -> step`.
 */
import { parseSubpointTrigger } from "../subpoint";

/** The result of feeding one keystroke to the trigger reducer. */
export interface SubpointTriggerStep {
  /** The token buffer after this keystroke (reset to `""` on commit/abandon). */
  readonly buffer: string;
  /**
   * The subpoint number to create, or `null` for none. Non-null only on an Enter
   * that committed a valid `S#` token; the caller fires the create and the buffer
   * is already cleared.
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
 * - `Enter` commits: if the buffer parses as a subpoint trigger
 *   ({@link parseSubpointTrigger}) it returns that number in `create` and an empty
 *   buffer; otherwise it just clears the buffer.
 * - Any other key (Escape, Space, Backspace, arrows, ...) abandons the token,
 *   resetting the buffer without firing.
 *
 * Pure: the same `(buffer, key)` always yields the same step.
 */
export function stepSubpointTrigger(
  buffer: string,
  key: string,
): SubpointTriggerStep {
  if (key === "Enter") {
    return { buffer: "", create: parseSubpointTrigger(buffer) };
  }
  if (isTokenKey(key)) {
    return { buffer: buffer + key, create: null };
  }
  return { buffer: "", create: null };
}
