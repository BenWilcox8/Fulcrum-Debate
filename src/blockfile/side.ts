/**
 * The debate side a block-file region belongs to.
 *
 * A block file is split into exactly two top-level regions - the affirmative
 * evidence and the negative evidence - and every addressing helper, section
 * tool, and ToC that later builds on the block-file schema keys off this side.
 * It is the same `aff`/`neg` axis the flow sheet uses (and the same `aff`/`neg`
 * design tokens), but the block-file module owns its own copy rather than
 * importing the flow module's, because the two are unrelated domains that only
 * happen to share the two-sided vocabulary of debate.
 */

/**
 * Which side of the debate a block-file region holds evidence for.
 *
 * `"aff"` is the affirmative region, `"neg"` the negative. The order here is the
 * canonical document order: a block file always renders the aff region first,
 * then the neg region (enforced by the {@link ./schema | schema}).
 */
export type BlockSide = "aff" | "neg";

/**
 * The two block-file sides in canonical document order (aff, then neg).
 *
 * A runtime tuple so callers can iterate the sides; the source of truth for the
 * region order the schema enforces.
 */
export const BLOCK_SIDES = ["aff", "neg"] as const;

/** Type guard: is `value` a known {@link BlockSide}? */
export function isBlockSide(value: unknown): value is BlockSide {
  return value === "aff" || value === "neg";
}
