/**
 * Addressing the two side regions of a block-file document.
 *
 * The {@link ./schema | schema} guarantees a block file always has exactly one
 * affirmative region followed by exactly one negative region at the top level.
 * This module is the small, stable query layer that turns that guarantee into
 * something later tooling can *act on*: given a block-file document (or an
 * editor), it locates each side's region and the range of positions that hold
 * that side's content.
 *
 * These are the seams section operations, a ToC sidebar, and card tools will
 * build on - "where does the aff content live", "select into the neg region",
 * "scope this query to one side". They are pure derivations of ProseMirror state
 * (like the {@link ../editor/headings/outline | outline query}), so there is
 * nothing to keep in sync and nothing to invalidate.
 *
 * ## Position semantics
 *
 * The positions on a {@link BlockSideRegion} are ProseMirror positions in the
 * document they were read from, and are only meaningful against that document
 * version - any edit can shift them. Re-derive after edits (drive the same
 * editor and call {@link getSideRegions} again). This is the same snapshot
 * discipline the outline query documents.
 */
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { BLOCK_SIDES, type BlockSide } from "./side";
import { SIDE_SECTION_NODE_NAME } from "./schema";

/**
 * The located region for one side of a block file - its section node and the
 * positions that address it and its content.
 */
export interface BlockSideRegion {
  /** Which side this region holds. */
  side: BlockSide;
  /** The section node itself (`affSection` / `negSection`). */
  node: ProseMirrorNode;
  /**
   * The ProseMirror position immediately before the section node. `pos + 1` is
   * the first position *inside* the section (before its first child). Use it to
   * address the section node itself.
   */
  pos: number;
  /**
   * The first position inside the section's content (`pos + 1`). A selection set
   * here lands at the very start of the side's content; new content inserted
   * here goes to the top of the side.
   */
  contentStart: number;
  /**
   * The position just past the last child of the section's content
   * (`contentStart + node.content.size`). Content inserted here appends to the
   * bottom of the side; `[contentStart, contentEnd]` is the range a per-side
   * query (e.g. a side-scoped ToC) walks.
   */
  contentEnd: number;
}

/**
 * Walks a block-file document node and returns each side's region, keyed by
 * side. Shared by {@link getSideRegions} and any caller that already holds a
 * ProseMirror doc node (e.g. one parsed from persisted JSON via the schema).
 *
 * Throws if the document does not contain both side sections - that would mean
 * the document was not built with the block-file {@link ./schema | schema}, or
 * the schema's enforced invariant has been violated (a bug), and callers should
 * be able to rely on both regions existing rather than defensively null-check.
 */
export function sideRegionsFromDoc(
  doc: ProseMirrorNode,
): Record<BlockSide, BlockSideRegion> {
  const found: Partial<Record<BlockSide, BlockSideRegion>> = {};

  // The sections are always top-level children of the doc; iterate direct
  // children rather than descending into their content.
  doc.forEach((node, offset) => {
    for (const side of BLOCK_SIDES) {
      if (node.type.name === SIDE_SECTION_NODE_NAME[side] && !found[side]) {
        const contentStart = offset + 1;
        found[side] = {
          side,
          node,
          pos: offset,
          contentStart,
          contentEnd: contentStart + node.content.size,
        };
      }
    }
  });

  for (const side of BLOCK_SIDES) {
    if (!found[side]) {
      throw new Error(
        `sideRegionsFromDoc: block-file document is missing its "${side}" ` +
          `section - the document was not built with the block-file schema.`,
      );
    }
  }

  return found as Record<BlockSide, BlockSideRegion>;
}

/**
 * Locates both side regions in an editor's current document. The editor
 * convenience form of {@link sideRegionsFromDoc}; equivalent to
 * `sideRegionsFromDoc(editor.state.doc)`.
 */
export function getSideRegions(
  editor: Editor,
): Record<BlockSide, BlockSideRegion> {
  return sideRegionsFromDoc(editor.state.doc);
}

/** Locates a single side's region in an editor's current document. */
export function getSideRegion(editor: Editor, side: BlockSide): BlockSideRegion {
  return getSideRegions(editor)[side];
}

/**
 * Moves the selection to the start of a side's content and focuses the editor -
 * the "jump to this side" gesture a ToC / navigation control drives. Returns the
 * editor for chaining. Positions are re-derived from current state, so this is
 * always safe to call.
 */
export function focusSide(editor: Editor, side: BlockSide): Editor {
  const { contentStart } = getSideRegion(editor, side);
  editor.chain().focus().setTextSelection(contentStart).run();
  return editor;
}
