/**
 * Public surface of the editor heading layer.
 *
 * Two concerns live here, both scoped to headings:
 *
 * - The {@link ./heading-extension | heading extension} that adds 1-6 heading
 *   levels to the shared editor schema. Layer it onto {@link createEditor}'s
 *   `extensions`; the editor core baseline ships without it.
 * - The {@link ./outline | outline query} - the table-of-contents seam. A pure
 *   {@link getOutline} snapshot plus an {@link observeOutline} live wrapper a
 *   ToC panel consumes.
 * - The {@link ./outline-tree | outline-tree derivation} - a pure
 *   {@link buildOutlineTree} that nests the flat outline into the hierarchy a
 *   ToC panel renders.
 */
export {
  heading,
  HEADING_LEVELS,
  isHeadingLevel,
  type HeadingLevel,
} from "./heading-extension";
export {
  getOutline,
  observeOutline,
  outlineFromDoc,
  type OutlineHeading,
} from "./outline";
export { buildOutlineTree, type OutlineTreeNode } from "./outline-tree";
