/**
 * The shared text marks for the Fulcrum Debate editor core.
 *
 * These layer on top of the {@link ../core | editor core}: pass them via
 * `createEditor({ ..., extensions: [BoldMark, HighlightMark] })`. Each is a
 * thin wrap of a Tiptap first-party extension that pins configuration and
 * documents its stable document-JSON schema.
 *
 * - {@link ./bold.BoldMark | BoldMark} - visual emphasis, JSON `{ type: "bold" }`.
 * - {@link ./highlight.HighlightMark | HighlightMark} - "read this aloud",
 *   single-color, JSON `{ type: "highlight" }`.
 *
 * The two are independent marks (separate names, distinct rendering) and compose
 * on the same text run.
 */
export { BoldMark, BOLD_MARK_NAME } from "./bold";
export { HighlightMark, HIGHLIGHT_MARK_NAME } from "./highlight";
