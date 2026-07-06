/**
 * The Send-to-Block-File operation - the model half of the "Send to Block File"
 * card-cutting tool.
 *
 * A debater cutting cards wants to file the card under the caret into a chosen
 * argument section of the structured block file, either **copying** it (leaving
 * the original where it is) or **moving** it (removing the original). This module
 * is the pure, editor-command seam that performs that, composed entirely from the
 * {@link ../../blockfile | block-file document operations}:
 *
 * - the card is located and serialized as one re-insertable unit via the
 *   {@link ../../blockfile/card-unit | card-as-a-unit API} ({@link getSelectedCard}
 *   + {@link serializeCard}), so its four-region anatomy and body marks (bold /
 *   highlight / font size) travel intact;
 * - the destination is addressed as an argument section (side + index) via the
 *   {@link ../../blockfile/argument-sections | section query} and the card is
 *   inserted at the end of that section's content block, located with
 *   {@link getSectionRange} (the section-ops boundary contract);
 * - the whole thing is one ProseMirror transaction on the Yjs-bound editor, so it
 *   persists through the document layer and is a single undo step.
 *
 * The tool operates on one block-file editor: the selected card and the
 * destination section both live in the same block file (the surface the
 * card-cutting toolbar sits on). Sending to a speech doc is a separate pipeline
 * and out of scope here.
 */
import type { Editor } from "@tiptap/core";

import {
  BLOCK_SIDES,
  type BlockSide,
  getSideSections,
  getSectionRange,
  getSelectedCard,
  serializeCard,
} from "../../blockfile";

/** Whether a send leaves the source card in place (`copy`) or removes it (`move`). */
export type SendMode = "move" | "copy";

/**
 * A destination the selected card can be sent to: an argument section addressed
 * by its side and its 0-based index within that side (the order
 * {@link getSideSections} returns). `label` is the section header's plain text,
 * for the picker and the confirmation message.
 *
 * Like every block-file index/position, the index is a snapshot identifier valid
 * against the document it was read from - re-list before acting after edits.
 */
export interface SendDestination {
  /** The side the section belongs to. */
  side: BlockSide;
  /** The section's 0-based index within its side. */
  index: number;
  /** The section header's plain text. */
  label: string;
}

/** Where a card can be addressed for sending: a side + section index. */
export interface SendTarget {
  side: BlockSide;
  index: number;
}

/** The outcome of a send, for confirming to the user where the card landed. */
export interface SendResult extends SendDestination {
  /** How the card was sent. */
  mode: SendMode;
}

/**
 * Enumerates every argument section in the block file as a possible send
 * destination, in document order (all of the aff side's sections, then the neg
 * side's). This is the seam the destination picker renders; a side with no
 * sections contributes nothing.
 */
export function listSendDestinations(editor: Editor): SendDestination[] {
  const destinations: SendDestination[] = [];
  for (const side of BLOCK_SIDES) {
    getSideSections(editor, side).forEach((section, index) => {
      destinations.push({ side, index, label: section.label });
    });
  }
  return destinations;
}

/**
 * Sends the card at the current selection into the argument section identified by
 * `target`, per `mode`.
 *
 * Returns a {@link SendResult} describing where the card landed (so the caller can
 * confirm it to the user), or `null` when the selection is not inside a card (a
 * no-op - nothing is changed). Throws if `target` names a section the side does
 * not have.
 *
 * The card is inserted at the *end* of the destination section's content block
 * (below any cards already filed there). For a move, the source card is removed in
 * the *same* transaction (its position mapped through the insertion), so a move is
 * one atomic, undoable step and the enforced `affSection negSection` document
 * shape is never disturbed.
 */
export function sendSelectedCard(
  editor: Editor,
  target: SendTarget,
  mode: SendMode,
): SendResult | null {
  const located = getSelectedCard(editor);
  if (!located) return null;

  const sections = getSideSections(editor, target.side);
  if (
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index >= sections.length
  ) {
    throw new Error(
      `sendSelectedCard: no section at index ${target.index} in the ` +
        `"${target.side}" side (${sections.length} section` +
        `${sections.length === 1 ? "" : "s"}).`,
    );
  }

  const label = sections[target.index].label;
  const cardJSON = serializeCard(located.node);
  const insertPos = getSectionRange(editor, target.side, target.index).to;
  const { from: sourceFrom, to: sourceTo } = located;

  const dispatched = editor
    .chain()
    .command(({ tr, editor: ed, dispatch }) => {
      if (!dispatch) return true;
      const node = ed.schema.nodeFromJSON(cardJSON);
      tr.insert(insertPos, node);
      if (mode === "move") {
        // The insertion shifted every position at/after insertPos; map the source
        // range through it so the delete removes the original, not the copy.
        tr.delete(tr.mapping.map(sourceFrom), tr.mapping.map(sourceTo));
      }
      return true;
    })
    .run();

  return dispatched ? { side: target.side, index: target.index, label, mode } : null;
}
