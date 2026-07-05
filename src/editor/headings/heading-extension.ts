/**
 * Heading level support for the shared editor schema.
 *
 * Debate documents lean on heading structure heavily: a speech doc's table of
 * contents is generated straight from its headings, and off-case positions,
 * arguments, subpoints, card tags, and analytics naturally nest several levels
 * deep. This module contributes the heading node to the editor schema; the
 * queryable outline that a ToC panel consumes lives alongside it in
 * {@link ./outline}.
 *
 * ## Why the full 1-6 range
 *
 * We support the complete HTML heading range, `<h1>`-`<h6>`, rather than a
 * narrower curated subset. Two reasons:
 *
 * - **It matches the semantic ceiling of HTML.** Six levels is exactly what the
 *   platform (and ProseMirror's default heading node) models, so there is no
 *   arbitrary Fulcrum-specific limit to remember, document, or defend.
 * - **Debate structure genuinely nests deeply.** A speech doc can run
 *   position -> contention -> subpoint -> card tag -> analytic, and a flow can
 *   mirror a full round; capping the range below six would force real content
 *   to collapse distinct levels together.
 *
 * A narrower range would also be a one-way door: `level` is a persisted node
 * attribute, so widening the allowed set later is a data-compatible change but
 * would leave older documents inconsistent with newer ones. Starting at the
 * natural maximum avoids that migration entirely. The outline query reports
 * whatever `level` a heading carries, so it stays correct regardless of range.
 */
import Heading from "@tiptap/extension-heading";
import type { Node } from "@tiptap/core";

/**
 * The heading levels the shared schema allows: the full HTML range `1..6`.
 *
 * This is a runtime tuple so callers (level pickers, validation, tests) can
 * iterate it, and the source of truth for {@link HeadingLevel}.
 */
export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

/** A supported heading level: one of {@link HEADING_LEVELS}. */
export type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Narrowing guard: is `value` one of the supported heading levels? */
export function isHeadingLevel(value: unknown): value is HeadingLevel {
  return (
    typeof value === "number" &&
    (HEADING_LEVELS as readonly number[]).includes(value)
  );
}

/**
 * The heading extension for the shared editor schema, configured for the full
 * {@link HEADING_LEVELS | 1-6} range.
 *
 * Layer this onto {@link createEditor}'s `extensions`; the editor core baseline
 * deliberately ships without it so heading support is opt-in and scoped here.
 * With it installed the standard Tiptap heading commands are available -
 * `editor.commands.setHeading({ level })`, `toggleHeading({ level })`, and
 * `setParagraph()` to clear one back to body text.
 *
 * A heading serializes into the document JSON as
 * `{ type: "heading", attrs: { level }, content: [...] }`; that shape is the
 * stable contract the {@link ./outline | outline query} and any ToC generator
 * read, and is asserted by the tests.
 */
export const heading: Node = Heading.configure({ levels: [...HEADING_LEVELS] });
