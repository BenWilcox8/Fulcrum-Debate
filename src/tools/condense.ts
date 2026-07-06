/**
 * The Condense card-cutting tool.
 *
 * When a debater cuts a card they often paste several source paragraphs into the
 * card body, then want the read-aloud text to flow as one block rather than as
 * separate paragraphs. **Condense** collapses the multiple paragraphs the debater
 * has selected inside a card body into a single paragraph, so the card reads as
 * one unit - while preserving every inline mark (bold, highlight, font size) on
 * the runs it merges. It changes only the block structure (paragraph boundaries),
 * never the inline content, so no formatting is lost.
 *
 * ## Mechanism: join the block boundaries, never rebuild the content
 *
 * The command finds the {@link https://prosemirror.net/docs/ref/#model.NodeRange
 * block range} the selection covers and joins each paragraph boundary inside it
 * (`Transform.join`). Joining removes only the boundary between two blocks and
 * leaves their inline content - text nodes and their marks - exactly as-is, which
 * is precisely why marks survive losslessly: nothing is re-serialized or
 * re-created, the paragraphs are simply merged in place. Boundaries are joined
 * back-to-front so earlier positions stay valid as the document shrinks, and each
 * join is guarded by {@link canJoin} so a non-joinable boundary (there should be
 * none inside a `paragraph+` card body) is skipped rather than throwing.
 *
 * ## Respecting card anatomy
 *
 * A `card` node is `isolating`, so a text selection can never span out of one card
 * body into another card or the surrounding section - ProseMirror clamps it. The
 * block range therefore always resolves within a single card body, and Condense
 * merges only the paragraphs of the one card the selection is in, leaving every
 * other card untouched. The three single-line header regions (`text*`) hold no
 * paragraph boundaries, so they are never affected.
 *
 * ## Enablement
 *
 * Condense is only meaningful when the selection actually spans **two or more**
 * paragraphs. {@link canCondenseSelection} is that precondition, wired to the tool
 * definition's {@link CardToolDefinition.isEnabled} so the toolbar disables the
 * button (on top of its baseline "a card is selected" gate) until the selection
 * spans multiple paragraphs. Running the command with a shorter selection is a
 * no-op that returns `false`, mirroring a Tiptap command chain.
 */
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { canJoin } from "@tiptap/pm/transform";

import type { CardToolDefinition } from "./registry";

/** Stable tool id, unique within the registry. */
export const CONDENSE_TOOL_ID = "condense";

/** Human-facing toolbar/settings label. */
export const CONDENSE_TOOL_LABEL = "Condense";

/**
 * The absolute positions of the paragraph boundaries inside the block range the
 * selection covers, or `null` when the selection spans fewer than two blocks (so
 * there is nothing to condense). Pure over `state` - the shared read behind both
 * {@link canCondenseSelection} and {@link condenseSelection}.
 */
function condensableBoundaries(state: EditorState): number[] | null {
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to);
  if (!range) return null;

  const { parent, startIndex, endIndex, start } = range;
  // Fewer than two blocks in the range: a single paragraph, nothing to merge.
  if (endIndex - startIndex < 2) return null;

  const boundaries: number[] = [];
  let pos = start;
  for (let i = startIndex; i < endIndex; i++) {
    pos += parent.child(i).nodeSize;
    // The boundary after every block but the last is a candidate join point.
    if (i < endIndex - 1) boundaries.push(pos);
  }
  return boundaries;
}

/**
 * Whether the editor's current selection spans multiple paragraphs and can be
 * condensed into one block. A pure read of editor state - the toolbar's
 * enablement predicate for the Condense tool.
 */
export function canCondenseSelection(editor: Editor): boolean {
  return condensableBoundaries(editor.state) !== null;
}

/**
 * Condenses the paragraphs the editor's current selection spans into a single
 * block, preserving every inline mark. Returns `true` if the document changed,
 * `false` (a no-op) when the selection does not span multiple paragraphs.
 */
export function condenseSelection(editor: Editor): boolean {
  return editor
    .chain()
    .command(({ state, tr, dispatch }) => {
      const boundaries = condensableBoundaries(state);
      if (!boundaries) return false;
      if (!dispatch) return true;

      // Join back-to-front so a join never shifts a not-yet-processed boundary.
      let joined = false;
      for (let i = boundaries.length - 1; i >= 0; i--) {
        const at = boundaries[i];
        if (canJoin(tr.doc, at)) {
          tr.join(at);
          joined = true;
        }
      }
      return joined;
    })
    .run();
}

/**
 * The Condense tool's settings schema. Condense has no user-customizable options -
 * it is a single deterministic operation - so the schema is empty; it still
 * registers as the tool's namespaced store section (for a stable, resettable
 * per-tool contract), simply with no fields.
 */
export type CondenseToolSettings = Record<string, never>;

/**
 * The Condense card-cutting tool definition. Registers on a
 * {@link createCardToolRegistry} to appear in the toolbar; its
 * {@link CardToolDefinition.isEnabled} narrows the toolbar's baseline card gate to
 * "the selection spans multiple paragraphs", and {@link applyToSelection} runs the
 * merge on the live selection.
 */
export const condenseTool: CardToolDefinition<CondenseToolSettings> = {
  id: CONDENSE_TOOL_ID,
  label: CONDENSE_TOOL_LABEL,
  description:
    "Collapse the selected paragraphs of a card body into one block of text, " +
    "preserving every inline mark, so the card reads as one unit.",
  settings: {},
  isEnabled: (editor) => canCondenseSelection(editor),
  applyToSelection: (editor) => condenseSelection(editor),
};
