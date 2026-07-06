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
 * - {@link useActiveHeading} tracks the scroll position against heading offsets
 *   so the sidebar highlights the section currently in view.
 *
 * Click-to-scroll navigation is deliberately out of scope here (a separate
 * follow-up issue).
 */
export {
  TableOfContents,
  type TableOfContentsProps,
} from "./TableOfContents";
export { TocRow, type TocRowProps } from "./TocRow";
export { useOutlineTree } from "./useOutlineTree";
export { useActiveHeading } from "./useActiveHeading";
export {
  findActiveHeading,
  ACTIVE_HEADING_TOLERANCE,
  type HeadingOffset,
} from "./active-heading";
