/**
 * The **Shrink** card-cutting tool.
 *
 * Shrink is the debater's affordance for making a card *skim-able*: the runs they
 * will read aloud are {@link ../../editor/marks | highlighted} and stay at reading
 * size, while everything they did *not* highlight is driven down to a small size so
 * the eye slides past it. Unlike the standing
 * {@link ../../formatting/shrink | unformatted-shrink rule} (which sets one fixed
 * size across the whole document), the *tool* is interactive and **progressive**:
 * each application steps the un-highlighted body text one notch down a configurable
 * size sequence, and one more application past the end returns it to normal. So
 * repeated clicking cycles the size and eventually undoes the shrink - the debater
 * never needs a separate "un-shrink".
 *
 * ## What it shrinks (and what it must never touch)
 *
 * The tool acts on the card the caret is in, and only on that card's **un-highlighted
 * body runs** - exactly the runs the shrink rule classifies as
 * {@link ../../formatting/shrink.UNFORMATTED_TARGET_KEY | unformatted}. It reuses
 * that classification so the two features agree on "unformatted":
 *
 * - highlighted body runs (the spoken text) are `highlight`, never `unformatted`,
 *   so Shrink leaves them untouched - the read-aloud text keeps its reading size;
 * - the tag, cite, and tagline regions resolve to their own named styles, not
 *   `unformatted`, so their standardised sizing is never disturbed.
 *
 * ## Sharing the font-size mark model
 *
 * Sizes are written as the same addressable `textStyle` + `fontSize` mark
 * {@link ../../editor/marks | src/editor/marks} owns and the formatting profile
 * stores, so a shrunk run is queryable document data and the size model stays
 * consistent across the feature. The tool's sequence is a *free* list of point
 * sizes (the default steps below the `FONT_SIZE_SCALE` minimum, to 5pt), so it does
 * **not** go through the scale-guarded `setFontSize` helper - it writes the
 * configured sizes verbatim, exactly as the unformatted-shrink rule writes its
 * (possibly off-scale) configured size. "Normal" is the *unset* state (no
 * `fontSize` mark), so the last cycle step clears the mark rather than writing a
 * size.
 *
 * ## Configurable sequence
 *
 * The sequence is the tool's one setting, a comma-separated point-size string
 * ({@link DEFAULT_SHRINK_SEQUENCE}, `"8pt, 7pt, 6pt, 5pt"`), so it renders as a
 * plain text control on the schema-generated Settings panel and persists through
 * the shared preference store like every other tool setting. A bare number is
 * normalised to points (`"6"` -> `"6pt"`), consistent with the point-string
 * convention the formatting profile uses.
 */
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

import { getSelectedCard } from "../../blockfile";
import {
  classifyRuns,
  UNFORMATTED_TARGET_KEY,
} from "../../formatting/shrink";
import type { PreferenceField } from "../../preferences";
import type { CardToolDefinition } from "../registry";

/** The tool's stable registry id. */
export const SHRINK_TOOL_ID = "shrink";

/**
 * The default shrink sequence: from the standard unformatted size (8pt) down in
 * one-point steps to 5pt, then (implicitly) back to normal. A comma-separated
 * point-size string so it is one editable field on the schema-generated Settings
 * panel.
 */
export const DEFAULT_SHRINK_SEQUENCE = "8pt, 7pt, 6pt, 5pt";

/**
 * The Shrink tool's settings schema: the one configurable size sequence. A `type`
 * alias (not an `interface`) so it satisfies the `SectionSchema`
 * `Record<string, PreferenceField<unknown>>` index-signature constraint.
 */
export type ShrinkToolSettings = {
  /** The comma-separated point-size sequence Shrink cycles through. */
  sizes: PreferenceField<string>;
};

/**
 * Parses the configured sequence string into an ordered list of point-size
 * strings: split on commas, trim, drop empty tokens, and normalise a bare number
 * to points (`"6"` -> `"6pt"`).
 */
export function parseShrinkSequence(raw: string): string[] {
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => (/^\d+(\.\d+)?$/.test(token) ? `${token}pt` : token));
}

/** Reads the `fontSize` attribute off a text node's `textStyle` mark, or null. */
function fontSizeOfNode(
  state: EditorState,
  marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[],
): string | null {
  const textStyle = state.schema.marks.textStyle;
  if (!textStyle) return null;
  const mark = marks.find((m) => m.type.name === textStyle.name);
  const value = mark?.attrs.fontSize;
  return typeof value === "string" ? value : null;
}

/** The `fontSize` on the first text node within `[from, to)`, or null if unset. */
function leadingSize(
  state: EditorState,
  from: number,
  to: number,
): string | null {
  let size: string | null = null;
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (found) return false;
    if (node.isText) {
      size = fontSizeOfNode(state, node.marks);
      found = true;
      return false;
    }
    return true;
  });
  return size;
}

/**
 * The next size in the cycle given the current size and the sequence: one step
 * down the sequence, wrapping past the last step to `null` (normal / unset). An
 * unset or off-sequence current size restarts the cycle at the first step.
 */
function nextSize(current: string | null, sequence: string[]): string | null {
  const index = current === null ? -1 : sequence.indexOf(current);
  const next = index + 1;
  return next >= sequence.length ? null : sequence[next];
}

/**
 * Applies one Shrink step to the card the editor's selection is in, using
 * `sequence` as the size cycle. Steps every un-highlighted body run to the next
 * size in the cycle (or clears the size on the last step, returning it to normal),
 * leaving highlighted runs and the tag/cite/tagline regions untouched. The prior
 * selection is restored.
 *
 * Returns whether it changed the document: `false` when the sequence is empty,
 * when the caret is not in a card, or when the card has no un-highlighted body run
 * to shrink.
 */
export function applyShrink(editor: Editor, sequence: string[]): boolean {
  if (sequence.length === 0) return false;

  const card = getSelectedCard(editor);
  if (!card) return false;

  const { state } = editor;
  const targets = classifyRuns(state).filter(
    (run) =>
      run.classification === UNFORMATTED_TARGET_KEY &&
      run.from >= card.from &&
      run.to <= card.to,
  );
  if (targets.length === 0) return false;

  const size = nextSize(leadingSize(state, targets[0].from, targets[0].to), sequence);

  const original = { from: state.selection.from, to: state.selection.to };
  let chain = editor.chain();
  for (const run of targets) {
    chain = chain.setTextSelection({ from: run.from, to: run.to });
    chain = size === null ? chain.unsetFontSize() : chain.setFontSize(size);
  }
  return chain.setTextSelection(original).run();
}

/**
 * The Shrink card-cutting tool: progressively shrinks the un-highlighted body text
 * of the caret's card through its configurable size sequence, returning to normal
 * at the end of the cycle. Highlighted (spoken) runs are never touched. A no-op
 * `false` when the caret is not in a card.
 */
export const shrinkCardTool: CardToolDefinition<ShrinkToolSettings> = {
  id: SHRINK_TOOL_ID,
  label: "Shrink",
  description:
    "Progressively shrinks the un-highlighted body text of the current card, " +
    "cycling through the size sequence and back to normal. Highlighted read-aloud " +
    "text is never shrunk.",
  settings: {
    sizes: {
      default: DEFAULT_SHRINK_SEQUENCE,
      label: "Shrink size sequence",
      description:
        "Comma-separated point sizes the un-highlighted body text cycles through " +
        'on each click, before returning to normal (e.g. "8pt, 7pt, 6pt, 5pt").',
    },
  },
  applyToSelection(editor, settings) {
    return applyShrink(editor, parseShrinkSequence(settings.sizes));
  },
};
