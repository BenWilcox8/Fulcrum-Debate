/**
 * The bold mark for the Fulcrum Debate editor.
 *
 * Bold is plain emphasis: it makes a run of text visually heavier. It is one of
 * the first shared marks layered on the {@link ../core | editor core} and is
 * deliberately independent of {@link ./highlight | highlight} - the two are
 * separate ProseMirror marks, so a debater can bold, highlight, or do both on
 * the same run and toggle each without touching the other.
 *
 * ## Schema (stable, other tools depend on it)
 *
 * This is Tiptap's first-party {@link https://tiptap.dev/api/marks/bold Bold}
 * extension, wrapped rather than forked so it stays version-matched to
 * `@tiptap/core`. The wrapping only names and documents the schema; it changes
 * no behavior.
 *
 * - **Mark name:** `bold` (see {@link BOLD_MARK_NAME}). In document JSON a bolded
 *   run carries `{ "type": "bold" }` in its `marks` array.
 * - **Attributes:** none. Bold is a pure boolean toggle.
 * - **HTML:** renders as `<strong>`; parses `<strong>`, `<b>`, and
 *   `font-weight` styles (the Tiptap defaults).
 *
 * Because the mark name and its (empty) attribute set are a contract other
 * surfaces read, treat them as fixed: never rename the mark or add attributes to
 * it without a coordinated schema migration.
 */
import Bold from "@tiptap/extension-bold";

/**
 * The document-JSON mark name for bold: `"bold"`.
 *
 * Exported as a named constant so consuming code and tests reference the schema
 * symbolically rather than hard-coding the string.
 */
export const BOLD_MARK_NAME = "bold";

/**
 * The bold mark extension, ready to pass to
 * {@link ../core/editor-core.createEditor | createEditor}'s `extensions`.
 *
 * Toggle it through the editor command API on the current selection:
 * `editor.commands.toggleBold()` (or `setBold()` / `unsetBold()`). It composes
 * with {@link ./highlight.HighlightMark} on the same run.
 */
export const BoldMark = Bold;
