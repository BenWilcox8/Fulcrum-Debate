/**
 * Public surface of the editor's addressable marks.
 *
 * Marks here are real, queryable document marks (never bare inline styles) so the
 * product's formatting tools can address and cycle them programmatically. See the
 * individual modules for design notes.
 *
 * Bold and highlight wrap first-party Tiptap extensions and layer on the editor
 * core via `createEditor({ ..., extensions: [BoldMark, HighlightMark] })`.
 * Font size builds on the `textStyle` carrier so the three marks compose cleanly.
 */
export { BoldMark, BOLD_MARK_NAME } from "./bold";
export { HighlightMark, HIGHLIGHT_MARK_NAME } from "./highlight";
export {
  FONT_SIZE_SCALE,
  DEFAULT_FONT_SIZE,
  UNSET_FONT_SIZE,
  fontSizeExtensions,
  setFontSize,
  unsetFontSize,
  readFontSizes,
  stepFontSizes,
  increaseFontSize,
  decreaseFontSize,
  cycleFontSize,
  type FontSize,
  type FontSizeValue,
  type FontSizeStep,
} from "./font-size";
