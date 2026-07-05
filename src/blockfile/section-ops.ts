/**
 * Section maintenance operations for a block-file side.
 *
 * The {@link ./argument-sections | argument-section query} is read-only: it
 * *finds* the argument-type sections inside a side. This module is the write
 * counterpart - the small, side-scoped set of operations a debater performs on
 * those sections as they curate a season's evidence: **add** a new section,
 * **rename** its header, and **reorder** a section within its side.
 *
 * Everything here is expressed through the shared editor's command API, so every
 * operation is an ordinary ProseMirror transaction on the Yjs-bound editor: it
 * persists through the {@link ../documents | document layer} for free and is
 * undoable through the collaboration binding's Yjs history (the no-`History`
 * undo rule the editor core documents - this module adds no history stack).
 *
 * ## What a section *is*, and where it ends (the boundary contract)
 *
 * A section is a level-{@link BLOCK_SECTION_HEADING_LEVEL} heading that is a
 * direct child of a side region (the exact contract the
 * {@link ./argument-sections | query} reads). A section's **content block** is
 * that header *plus everything under it* - every direct child of the side from
 * the header up to, but not including, the next section header in the same side,
 * or the side's end if there is none. Reordering moves this whole block, never
 * just the header: the cards, subpoints, and analytics a debater filed under an
 * argument travel with it. {@link getSectionRange} exposes this boundary
 * explicitly.
 *
 * Content that sits in a side *before* its first section header (e.g. the empty
 * paragraph the schema backfills) is not part of any section; it is preamble and
 * stays at the top of the side across every reorder.
 *
 * ## Cross-side integrity
 *
 * Every operation is scoped to one side and works entirely inside that side's
 * region ({@link ../blockfile/sections.getSideRegion | getSideRegion}), so it can
 * never move content across the enforced aff/neg boundary or otherwise violate
 * the {@link ./schema | schema}: a reorder replaces only the *content* range of a
 * single section node, which keeps the `isolating` side wrappers - and the
 * document's `affSection negSection` shape - intact.
 *
 * ## Identifying a section
 *
 * Operations address a section by its **index within the side**, matching the
 * order {@link getSideSections} returns (0-based, document order). An index is a
 * snapshot identifier, valid against the document the caller just read - exactly
 * like the `pos` on a {@link ./argument-sections.BlockSection | BlockSection}.
 */
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";

import type { BlockSide } from "./side";
import { getSideRegion, sideRegionsFromDoc } from "./sections";
import {
  BLOCK_SECTION_HEADING_LEVEL,
  getSideSections,
  sideSectionsFromDoc,
} from "./argument-sections";

/** The node-type name ProseMirror gives a heading node (Tiptap's default). */
const HEADING_NODE = "heading";

/**
 * Where a new section is placed within its side.
 *
 * - `"start"` - at the very top of the side's content (above any preamble's
 *   following sections, i.e. before the first section).
 * - `"end"` - at the bottom of the side's content (after the last section).
 * - `{ before: index }` - immediately before the section at `index`.
 * - `{ after: index }` - immediately after the *whole content block* of the
 *   section at `index` (so before the next section, if any).
 *
 * `index` is a section's position in {@link getSideSections} order.
 */
export type SectionPlacement =
  | "start"
  | "end"
  | { before: number }
  | { after: number };

/** Clamp `index` into `[0, length - 1]` (matches the flow move helpers). */
function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}

/** Throw if `index` is not a valid section index for a side of `count` sections. */
function assertSectionIndex(
  op: string,
  side: BlockSide,
  index: number,
  count: number,
): void {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(
      `${op}: no section at index ${index} in the "${side}" side ` +
        `(${count} section${count === 1 ? "" : "s"}).`,
    );
  }
}

/**
 * The ProseMirror position range of a section's whole content block in the
 * editor's current document: `from` is the position immediately before the
 * section's heading, `to` is the position where the block ends - immediately
 * before the next section's heading in the same side, or the side's content end
 * if this is the last section.
 *
 * The range covers the header and everything filed under it. Like every position
 * this module and its query sibling return, it is a snapshot valid only against
 * the document version it was read from; re-derive after edits.
 *
 * Throws if `index` is out of range for the side.
 */
export function getSectionRange(
  editor: Editor,
  side: BlockSide,
  index: number,
): { from: number; to: number } {
  const sections = getSideSections(editor, side);
  assertSectionIndex("getSectionRange", side, index, sections.length);
  const { contentEnd } = getSideRegion(editor, side);
  return {
    from: sections[index].pos,
    to: sections[index + 1]?.pos ?? contentEnd,
  };
}

/** Resolve a {@link SectionPlacement} to the document position to insert at. */
function placementPos(
  editor: Editor,
  side: BlockSide,
  placement: SectionPlacement,
): number {
  const region = getSideRegion(editor, side);
  if (placement === "start") return region.contentStart;
  if (placement === "end") return region.contentEnd;

  const sections = getSideSections(editor, side);
  if ("before" in placement) {
    assertSectionIndex("addSection", side, placement.before, sections.length);
    return sections[placement.before].pos;
  }
  assertSectionIndex("addSection", side, placement.after, sections.length);
  // After the whole block: the start of the next section, or the side's end.
  return sections[placement.after + 1]?.pos ?? region.contentEnd;
}

/**
 * Adds a new argument-type section header to a side at `placement`
 * (default `"end"`). The header is a level-{@link BLOCK_SECTION_HEADING_LEVEL}
 * heading carrying `label` as its text, so it is immediately picked up by
 * {@link getSideSections}. Returns the editor for chaining.
 *
 * The new section starts empty - just its header; a debater fills its content
 * below it. Adding never touches the other side. Throws if a
 * `before`/`after` placement references a section index the side does not have.
 */
export function addSection(
  editor: Editor,
  side: BlockSide,
  label: string,
  placement: SectionPlacement = "end",
): Editor {
  const at = placementPos(editor, side, placement);
  editor
    .chain()
    .insertContentAt(at, {
      type: HEADING_NODE,
      attrs: { level: BLOCK_SECTION_HEADING_LEVEL },
      content: label ? [{ type: "text", text: label }] : [],
    })
    .run();
  return editor;
}

/**
 * Renames the section at `index` within `side`, replacing its header text with
 * `label` while leaving the section's content block untouched. Returns the
 * editor for chaining.
 *
 * Only the heading's inline text is replaced, so the heading node (and therefore
 * the section) survives - this is a relabel, not a structural change. Throws if
 * `index` is out of range for the side.
 */
export function renameSection(
  editor: Editor,
  side: BlockSide,
  index: number,
  label: string,
): Editor {
  const sections = getSideSections(editor, side);
  assertSectionIndex("renameSection", side, index, sections.length);
  const { pos } = sections[index];
  const heading = editor.state.doc.nodeAt(pos);
  // The heading's inline content spans (pos + 1) .. (pos + 1 + content.size);
  // replacing just that range with text keeps the heading wrapper in place.
  const from = pos + 1;
  const to = from + (heading?.content.size ?? 0);
  editor.chain().insertContentAt({ from, to }, label).run();
  return editor;
}

/**
 * Moves the section at `fromIndex` within `side` to `toIndex`, carrying its
 * **entire content block** (header plus everything filed under it, per the
 * boundary contract) as one unit. Returns the editor for chaining.
 *
 * `toIndex` is clamped into range; a move to the section's current position is a
 * no-op. Throws if `fromIndex` is out of range for the side. Only the side's own
 * content is rewritten - preamble stays at the top and the other side is never
 * touched.
 *
 * The reorder rebuilds the side's content from the same child nodes in a new
 * order inside one transaction, so section identity and the rich content each
 * section carries are preserved (nothing is re-created), and the single
 * transaction is one Yjs undo step.
 */
export function moveSection(
  editor: Editor,
  side: BlockSide,
  fromIndex: number,
  toIndex: number,
): Editor {
  const sections = getSideSections(editor, side);
  assertSectionIndex("moveSection", side, fromIndex, sections.length);
  const target = clampIndex(toIndex, sections.length);
  if (target === fromIndex) return editor;

  editor
    .chain()
    .command(({ tr, state, dispatch }) => {
      const region = sideRegionsFromDoc(state.doc)[side];

      // Collect the side's direct children and the child indices at which each
      // section begins (a level-1 heading direct child).
      const children: ProseMirrorNode[] = [];
      const starts: number[] = [];
      region.node.forEach((child, _offset, childIndex) => {
        children.push(child);
        if (
          child.type.name === HEADING_NODE &&
          child.attrs.level === BLOCK_SECTION_HEADING_LEVEL
        ) {
          starts.push(childIndex);
        }
      });

      // Split into preamble (before the first section) + one slice per section,
      // where a slice is the header plus every child up to the next section.
      const firstStart = starts[0] ?? children.length;
      const preamble = children.slice(0, firstStart);
      const slices = starts.map((start, k) =>
        children.slice(start, starts[k + 1] ?? children.length),
      );

      // Reorder whole blocks, then flatten back into the side's content.
      const [moved] = slices.splice(fromIndex, 1);
      slices.splice(target, 0, moved);
      const rebuilt = Fragment.fromArray([...preamble, ...slices.flat()]);

      if (dispatch) {
        tr.replaceWith(region.contentStart, region.contentEnd, rebuilt);
      }
      return true;
    })
    .run();
  return editor;
}

/**
 * The doc-node form of {@link getSectionRange}, for callers already holding a
 * block-file document node (e.g. one parsed from persisted JSON). Returns the
 * content-block range of the section at `index` within `side`.
 *
 * Throws if the document is not block-file shaped (via
 * {@link ./sections.sideRegionsFromDoc}) or `index` is out of range.
 */
export function sectionRangeFromDoc(
  doc: ProseMirrorNode,
  side: BlockSide,
  index: number,
): { from: number; to: number } {
  const sections = sideSectionsFromDoc(doc, side);
  assertSectionIndex("sectionRangeFromDoc", side, index, sections.length);
  const { contentEnd } = sideRegionsFromDoc(doc)[side];
  return {
    from: sections[index].pos,
    to: sections[index + 1]?.pos ?? contentEnd,
  };
}
