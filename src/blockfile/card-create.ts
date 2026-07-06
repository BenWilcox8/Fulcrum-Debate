/**
 * Quick card creation: the fast, no-dialog gesture a debater uses to drop a fresh
 * card skeleton into the block file and start typing immediately.
 *
 * A card is fixed, structured content (see {@link ./card | the card node model}),
 * not free-form prose, so "make a new card" cannot be left to the debater to hand-
 * assemble. This module is the one gesture that does it: it inserts a schema-valid
 * card - all four regions present, the body backfilled with an empty paragraph -
 * into whichever side the debater is working in, then lands the caret in the tag
 * region so the very next keystroke fills the tag. No dialog, no multi-step flow;
 * one command, instant.
 *
 * ## Two seams, one behavior
 *
 * - **{@link insertCard}** is the imperative command - the same plain
 *   `(editor, ...) => ...` shape as the {@link ./section-ops | section operations}.
 *   A visible affordance (the Block File screen's *New card* button) and the
 *   keyboard shortcut both call it, so there is exactly one creation code path.
 * - **{@link cardCreate}** is a tiny Tiptap extension that carries nothing but the
 *   keyboard binding, layered onto the shared preset's feature-extension seam
 *   alongside {@link ./card.cardExtensions | cardExtensions}. Binding a `Mod-`
 *   chord through an extension is exactly how the shared marks register their
 *   shortcuts, so this stays consistent with the editor's conventions.
 *
 * ## Where the card lands
 *
 * Creation follows the caret so it works identically in both the aff and neg
 * sides. The card is inserted as a sibling **right after the top-level side block
 * the caret is in** (the current paragraph, heading, or card), so it appears where
 * the debater is working and the side never begins with a card (which would trip
 * the y-prosemirror leading-node warning noted in {@link ./card}). When the caret
 * is not resolvably inside a side, or a specific `side` is requested, the card is
 * appended to the end of that side's content instead.
 */
import { Extension, type Editor } from "@tiptap/core";

import { buildCardContent, type CardFields } from "./card";
import { getSideRegion } from "./sections";
import { BLOCK_SIDES, type BlockSide } from "./side";
import { SIDE_SECTION_NODE_NAME } from "./schema";

/**
 * The keyboard chord that triggers quick card creation. A `Mod-Shift-` chord,
 * mirroring the shared marks' shortcut convention (`Mod-b`, `Mod-Shift-h`); `c`
 * is the card mnemonic. `Mod` is Cmd on macOS and Ctrl elsewhere.
 */
export const CARD_CREATE_SHORTCUT = "Mod-Shift-c";

/** Options for {@link insertCard}. */
export interface InsertCardOptions {
  /**
   * Force the card into a specific side and append it to that side's end,
   * ignoring the caret. Omit to follow the caret (the default gesture).
   */
  side?: BlockSide;
  /**
   * Free-form field values to seed the new card with (see {@link CardFields}).
   * Omit for a blank skeleton.
   */
  fields?: CardFields;
}

/** The {@link BlockSide} a side-section node type name belongs to, or null. */
function sideOfSectionName(name: string): BlockSide | null {
  for (const side of BLOCK_SIDES) {
    if (SIDE_SECTION_NODE_NAME[side] === name) return side;
  }
  return null;
}

/**
 * Resolves the document position to insert the new card at. Follows the caret
 * (inserting after its enclosing top-level side block) unless a `side` is forced,
 * in which case it appends to that side's content end.
 */
function cardInsertPos(editor: Editor, side?: BlockSide): number {
  if (side) return getSideRegion(editor, side).contentEnd;

  // A block file is `doc(0) > side(1) > block(2) > ...`, so depth-1 is always the
  // side section and depth-2 is the top-level block the caret sits under. Insert
  // right after that block so the card is its next sibling within the side.
  const { $from } = editor.state.selection;
  if ($from.depth >= 1) {
    const caretSide = sideOfSectionName($from.node(1).type.name);
    if (caretSide) {
      return $from.depth >= 2
        ? $from.after(2)
        : getSideRegion(editor, caretSide).contentEnd;
    }
  }

  // The caret is not resolvably inside a side (e.g. a fresh, unfocused editor):
  // fall back to appending to the aff side.
  return getSideRegion(editor, "aff").contentEnd;
}

/**
 * Inserts a fresh, schema-valid card skeleton and lands the caret in its tag
 * region, ready to type. Returns whether the edit was applied.
 *
 * By default the card follows the caret into the current side (see the module
 * notes); pass `side` to force it, or `fields` to seed it. The insert and the
 * caret move are one transaction, so a single undo removes the whole card.
 */
export function insertCard(
  editor: Editor,
  options: InsertCardOptions = {},
): boolean {
  const at = cardInsertPos(editor, options.side);
  // Insert the full built node (tiptap's `insertContentAt` validates strictly and
  // does not `createAndFill`, so a bare `{ type: "card" }` would be rejected).
  // `updateSelection: false` keeps tiptap from parking the caret on the block-
  // level card; we then place it explicitly inside the tag region. The card opens
  // at `at`, so `at + 1` is inside the card (before the tag) and `at + 2` is the
  // first text position inside the empty tag region.
  return editor
    .chain()
    .insertContentAt(at, buildCardContent(options.fields), {
      updateSelection: false,
    })
    .setTextSelection(at + 2)
    .focus()
    .run();
}

/**
 * The quick-create keyboard binding as a ready-to-install extension. Append it
 * after {@link ./card.cardExtensions | cardExtensions} in the shared preset's
 * feature-extension seam so a block-file editor gets the {@link CARD_CREATE_SHORTCUT}
 * chord. It carries only the shortcut - the actual work lives in {@link insertCard},
 * which the screen's *New card* button also calls.
 */
export const cardCreate: Extension = Extension.create({
  name: "cardCreate",
  addKeyboardShortcuts() {
    return {
      [CARD_CREATE_SHORTCUT]: () => insertCard(this.editor),
    };
  },
});
