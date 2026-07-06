/**
 * The Extract Highlight card-cutting tool.
 *
 * A debater cuts a card from a long, dense source paragraph, then highlights only
 * the handful of sentences they will actually read aloud. **Extract Highlight**
 * isolates that read-aloud rhetoric: it collects the highlighted runs of the card
 * the caret is in and produces a fresh card containing *only* that highlighted
 * content, so the debater has a clean, speech-ready version of the card without the
 * surrounding un-highlighted prose.
 *
 * ## The UX decision: extract into a new sibling card, source intact by default
 *
 * The Card-Cutting Tools PRD leaves "produces that isolated content" open between
 * *selecting* the highlighted runs and *extracting* them into a new region, and
 * requires the **source to be left intact by default**. This tool takes the
 * extract-into-a-new-region reading, for two reasons:
 *
 * - A ProseMirror selection cannot span the *discontiguous* runs a highlight query
 *   returns (highlighted text interleaved with skipped text), so "select the runs"
 *   is not a faithful single gesture. An extracted region is.
 * - The extracted content is only useful as a *card* - a debater reads cards, and
 *   the standing formatting standards style card regions. So Extract emits a new
 *   {@link ../../blockfile/card | card} inserted immediately after the source
 *   (respecting the `isolating` card boundary), copying the source's tag, tagline,
 *   and cite so the extracted card is a complete, identifiable unit, with a body of
 *   just the highlighted runs (marks preserved).
 *
 * The source card is **never modified** - Extract is a copy, not a move. Relocating
 * a card between block files is the separate *Send to Block File* tool's job; a
 * destructive "cut the highlights out of the source" mode is deliberately out of
 * scope here (it would leave the source card gutted for little value), which is why
 * Extract exposes no settings.
 *
 * ## Sharing the highlighted-runs query
 *
 * The "which runs are highlighted" question is answered by the shared
 * {@link ../../editor/marks.highlightedRuns | highlightedRuns} query, **not** a
 * private walk - the Auto Speech pipeline reuses the same primitive to assemble a
 * speech from highlighted runs across many cards. Extract runs it per source-body
 * paragraph so the extracted body keeps one paragraph per source paragraph that has
 * highlights (paragraphs with none are dropped), preserving sentence structure
 * rather than gluing everything into one block.
 *
 * ## Enablement
 *
 * Extract is only meaningful on a card that actually has highlighted text.
 * {@link canExtractHighlight} is that precondition, wired to the tool's
 * {@link CardToolDefinition.isEnabled} so the toolbar disables the button (on top of
 * its baseline "a card is selected" gate) until the addressed card has a highlighted
 * run. Running the command otherwise is a no-op returning `false`.
 */
import type { Editor, JSONContent } from "@tiptap/core";

import { hasHighlightedRuns, highlightedRuns } from "../../editor/marks";
import {
  CARD_NODE_NAME,
  CARD_TAG_NODE_NAME,
  CARD_TAGLINE_NODE_NAME,
  CARD_CITE_NODE_NAME,
  CARD_BODY_NODE_NAME,
  getSelectedCard,
  readCardRegionText,
  type LocatedCard,
} from "../../blockfile";
import type { CardToolDefinition } from "../registry";

/** Stable tool id, unique within the registry. */
export const EXTRACT_HIGHLIGHT_TOOL_ID = "extract-highlight";

/** Human-facing toolbar/settings label. */
export const EXTRACT_HIGHLIGHT_TOOL_LABEL = "Extract Highlight";

/** A `text*` region's JSON: a lone text leaf, or an empty region. */
function textRegion(type: string, text: string): JSONContent {
  return text ? { type, content: [{ type: "text", text }] } : { type };
}

/**
 * Builds the extracted card's body paragraphs from a source card: one paragraph
 * per source-body paragraph that has highlighted runs, holding just those runs
 * (marks preserved via the shared query). Returns `null` when the card has no
 * highlighted content at all.
 */
function extractedBodyParagraphs(card: LocatedCard): JSONContent[] | null {
  const body = card.regions.body.node;
  const paragraphs: JSONContent[] = [];
  body.forEach((paragraph) => {
    const runs = highlightedRuns(paragraph);
    if (runs.length === 0) return;
    paragraphs.push({
      type: "paragraph",
      content: runs.flatMap((run) => run.content),
    });
  });
  return paragraphs.length > 0 ? paragraphs : null;
}

/**
 * Builds the extracted card's document-JSON from the source card: the source's
 * tag/tagline/cite carried over, and a body of just the highlighted runs. Returns
 * `null` when there is nothing highlighted to extract. Pure over the located card.
 */
export function buildExtractedCard(card: LocatedCard): JSONContent | null {
  const paragraphs = extractedBodyParagraphs(card);
  if (!paragraphs) return null;
  return {
    type: CARD_NODE_NAME,
    content: [
      textRegion(CARD_TAG_NODE_NAME, readCardRegionText(card.node, "tag")),
      textRegion(
        CARD_TAGLINE_NODE_NAME,
        readCardRegionText(card.node, "tagline"),
      ),
      textRegion(CARD_CITE_NODE_NAME, readCardRegionText(card.node, "cite")),
      { type: CARD_BODY_NODE_NAME, content: paragraphs },
    ],
  };
}

/**
 * Whether the card the editor's current selection is in has any highlighted text
 * to extract. A pure read of editor state - the toolbar's enablement predicate for
 * the Extract Highlight tool.
 */
export function canExtractHighlight(editor: Editor): boolean {
  const card = getSelectedCard(editor);
  return card !== null && hasHighlightedRuns(card.regions.body.node);
}

/**
 * Extracts the highlighted runs of the card the editor's current selection is in
 * into a fresh card inserted immediately after the source, leaving the source
 * intact. Returns `true` if a card was extracted, `false` (a no-op) when the caret
 * is not in a card or the card has no highlighted runs.
 */
export function extractHighlight(editor: Editor): boolean {
  const card = getSelectedCard(editor);
  if (!card) return false;
  const extracted = buildExtractedCard(card);
  if (!extracted) return false;

  // Insert as the next sibling after the source card. `card.to` is the position
  // immediately after the source card node; `updateSelection: false` keeps the
  // caret where the debater is working rather than jumping into the new card.
  return editor
    .chain()
    .insertContentAt(card.to, extracted, { updateSelection: false })
    .run();
}

/**
 * The Extract Highlight tool's settings schema. Extract has no user-customizable
 * options - it is a single deterministic operation (copy the highlighted runs into
 * a new card) - so the schema is empty; it still registers as the tool's namespaced
 * store section for a stable, resettable per-tool contract, simply with no fields.
 */
export type ExtractHighlightToolSettings = Record<string, never>;

/**
 * The Extract Highlight card-cutting tool definition. Registers on a
 * {@link createCardToolRegistry} to appear in the toolbar; its
 * {@link CardToolDefinition.isEnabled} narrows the toolbar's baseline card gate to
 * "the addressed card has highlighted runs", and {@link applyToSelection} performs
 * the extraction on the live selection.
 */
export const extractHighlightTool: CardToolDefinition<ExtractHighlightToolSettings> =
  {
    id: EXTRACT_HIGHLIGHT_TOOL_ID,
    label: EXTRACT_HIGHLIGHT_TOOL_LABEL,
    description:
      "Isolate a card's read-aloud text: copy the highlighted runs into a fresh " +
      "card right after it, preserving marks and leaving the source intact.",
    settings: {},
    isEnabled: (editor) => canExtractHighlight(editor),
    applyToSelection: (editor) => extractHighlight(editor),
  };
