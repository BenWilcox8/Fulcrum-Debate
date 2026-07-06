/**
 * The table-of-contents sidebar: a persistent, live projection of a document
 * editor's heading outline.
 *
 * - {@link TableOfContents} is the sidebar region - it observes the editor's
 *   outline and renders the nested tree derivation as rows. Persistent, not a
 *   toggled panel.
 * - {@link TocRow} is one heading row, with an explicit leading-control slot a
 *   later per-heading feature (speech-doc pipeline checkboxes) fills without
 *   rewriting the row.
 * - {@link useOutlineTree} is the underlying hook: observe outline + build tree.
 *
 * Click-to-scroll and current-section highlighting are deliberately out of scope
 * here (separate follow-up issues).
 */
export {
  TableOfContents,
  type TableOfContentsProps,
} from "./TableOfContents";
export { TocRow, type TocRowProps } from "./TocRow";
export { useOutlineTree } from "./useOutlineTree";
