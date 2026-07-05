/**
 * The highlight mark for the Fulcrum Debate editor.
 *
 * Highlight has a specific debate meaning distinct from emphasis: it marks the
 * text a debater actually reads aloud out of a longer card or block. That is a
 * different axis from {@link ./bold | bold} (visual emphasis), so the two are
 * deliberately kept as separate, fully independent ProseMirror marks - a run can
 * be highlighted, bold, or both, and each toggles without disturbing the other.
 * They also render distinctly (`<mark>` vs `<strong>`).
 *
 * ## Single-color by design
 *
 * The mark is configured `multicolor: false`: highlight is a boolean "read this
 * aloud" flag, not a palette. That keeps the schema attribute-free and the
 * document JSON minimal and stable. If a future PRD genuinely needs per-run
 * highlight colors it must claim that as a schema change (adding a `color`
 * attribute), not toggle it on ad hoc.
 *
 * ## Schema (stable, other tools depend on it)
 *
 * This wraps Tiptap's first-party
 * {@link https://tiptap.dev/api/marks/highlight Highlight} extension rather than
 * forking it, so it stays version-matched to `@tiptap/core`. The wrapping only
 * pins configuration and documents the schema; behavior is Tiptap's.
 *
 * - **Mark name:** `highlight` (see {@link HIGHLIGHT_MARK_NAME}). In document
 *   JSON a highlighted run carries `{ "type": "highlight" }` in its `marks`
 *   array.
 * - **Attributes:** none (single-color). No `color`/`data-color` attribute is
 *   emitted.
 * - **HTML:** renders as `<mark>`; parses `<mark>` (the Tiptap default).
 *
 * The mark name and its empty attribute set are a contract other surfaces read;
 * treat them as fixed.
 */
import Highlight from "@tiptap/extension-highlight";

/**
 * The document-JSON mark name for highlight: `"highlight"`.
 *
 * Exported as a named constant so consuming code and tests reference the schema
 * symbolically rather than hard-coding the string.
 */
export const HIGHLIGHT_MARK_NAME = "highlight";

/**
 * The highlight mark extension, configured single-color and ready to pass to
 * {@link ../core/editor-core.createEditor | createEditor}'s `extensions`.
 *
 * Toggle it through the editor command API on the current selection:
 * `editor.commands.toggleHighlight()` (or `setHighlight()` /
 * `unsetHighlight()`). It composes with {@link ./bold.BoldMark} on the same run
 * and toggles fully independently of it.
 */
export const HighlightMark = Highlight.configure({ multicolor: false });
