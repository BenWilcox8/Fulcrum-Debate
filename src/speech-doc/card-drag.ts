/**
 * The **drag source** half of the single-card drag-into-Speech-Doc pipeline: it
 * makes each block-file card draggable and, at drag start, produces the
 * Auto-Speech-formatted copy that will land in the speech doc.
 *
 * A debater grabs a card by its drag handle in the block file and drops it into
 * the docked speech doc. The card - **with its enclosing argument-section
 * heading** - is copied (the block file is never mutated), run through the shared
 * {@link ../speech.transformToSpeech | Auto Speech engine} here on the block-file
 * side (which is where the card node types live), and the resulting block-level
 * document-JSON is written onto the drag's `DataTransfer` in the shared
 * {@link ./card-drag-transfer | wire format}. The {@link ./card-drop | drop
 * target} then inserts those blocks at the drop position, needing no knowledge of
 * cards.
 *
 * ## Why transform on the drag side
 *
 * The engine walks ProseMirror card nodes, which only exist in the block-file
 * schema; the speech doc's schema has no `card` node. Running the transform where
 * the card lives keeps the drop side schema-agnostic (it inserts plain
 * paragraph/heading/text JSON, all of which the speech doc's preset understands)
 * and means "run through the Auto Speech engine" happens exactly once, at the
 * moment of the copy.
 *
 * ## Non-destructive by construction
 *
 * {@link buildCardSpeechDragData} only *reads* the block-file document (via the
 * pure {@link ../blockfile.cardAt | card-unit} and
 * {@link ../blockfile.sideSectionsFromDoc | argument-section} queries) and returns
 * fresh document-JSON. Nothing in the block file is touched by a drag, so "the
 * source card remains unchanged" is a property of the code, not a convention.
 *
 * ## Installation
 *
 * {@link CardSpeechDrag} is a Tiptap extension layered onto the **block-file**
 * editor's preset (alongside `blockFileExtensions` / `cardExtensions`). It adds a
 * per-card drag handle (a view-only widget decoration) and the `dragstart`
 * behaviour; it changes neither the schema nor the document.
 */
import { Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Fragment } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  BLOCK_SIDES,
  CARD_NODE_NAME,
  cardAt,
  sideRegionsFromDoc,
  sideSectionsFromDoc,
  type BlockSide,
} from "../blockfile";
import { transformToSpeech, type SpeechTransformOptions } from "../speech";
import { writeCardSpeechBlocks } from "./card-drag-transfer";

/** The node-type name Tiptap gives a heading (an argument-section header). */
const HEADING_NODE_NAME = "heading";

/** The data attribute marking a card's drag handle element. */
export const CARD_DRAG_HANDLE_ATTR = "data-card-drag-handle";

/** The payload {@link buildCardSpeechDragData} produces for one dragged card. */
export interface CardSpeechDragData {
  /** The card (and its heading) as Auto-Speech-formatted block-level document-JSON. */
  blocks: JSONContent[];
  /** The enclosing argument-section heading text, or `null` if the card has none. */
  sectionLabel: string | null;
}

/**
 * Finds the argument-section heading node that encloses the card at `cardFrom`
 * (the nearest preceding level-{@link ../blockfile.BLOCK_SECTION_HEADING_LEVEL}
 * heading within the *same* side), or `null` when the card sits under no heading.
 *
 * Scoping to the card's own side matters: a negative-side card with no negative
 * heading must not pick up an affirmative heading that merely precedes it in
 * document order.
 */
function enclosingSectionHeading(
  doc: ProseMirrorNode,
  cardFrom: number,
): ProseMirrorNode | null {
  const regions = sideRegionsFromDoc(doc);
  let side: BlockSide | null = null;
  for (const candidate of BLOCK_SIDES) {
    const region = regions[candidate];
    if (cardFrom >= region.pos && cardFrom < region.pos + region.node.nodeSize) {
      side = candidate;
      break;
    }
  }
  if (!side) return null;

  let best: { pos: number } | null = null;
  for (const section of sideSectionsFromDoc(doc, side)) {
    if (section.pos <= cardFrom && (!best || section.pos > best.pos)) {
      best = section;
    }
  }
  if (!best) return null;

  const node = doc.nodeAt(best.pos);
  return node && node.type.name === HEADING_NODE_NAME ? node : null;
}

/**
 * Builds the drag payload for the card at (or containing) `pos`: the card plus its
 * enclosing argument-section heading, run through the Auto Speech engine.
 *
 * `pos` may be any position inside the card. Returns `null` when `pos` is not in a
 * card, or when the resulting speech is empty (a card whose regions are all
 * empty) - in which case a drag carries nothing and the drop is a no-op. Pure:
 * `doc` is only read.
 */
export function buildCardSpeechDragData(
  doc: ProseMirrorNode,
  pos: number,
  options: SpeechTransformOptions = {},
): CardSpeechDragData | null {
  const located = cardAt(doc, pos);
  if (!located) return null;

  const heading = enclosingSectionHeading(doc, located.from);
  const items = heading ? [heading, located.node] : [located.node];
  // `create` (unlike `createChecked`) skips content validation, so wrapping the
  // heading + card under a throwaway doc node is safe - the engine only walks
  // structure, never resolving positions against the wrapper. Same pattern the
  // Auto Speech clipboard tool uses for a multi-node selection.
  const wrapper = doc.type.create(null, Fragment.fromArray(items));
  const blocks = transformToSpeech(wrapper, options);
  if (blocks.length === 0) return null;

  return { blocks, sectionLabel: heading ? heading.textContent : null };
}

/** The plugin key for the card drag-source plugin. */
export const cardSpeechDragPluginKey = new PluginKey("cardSpeechDrag");

/** Builds the per-card drag-handle widget decorations for a block-file document. */
function cardDragHandleDecorations(
  doc: ProseMirrorNode,
  options: SpeechTransformOptions,
): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === CARD_NODE_NAME) {
      decorations.push(
        Decoration.widget(
          pos + 1,
          (view, getPos) => createCardDragHandle(view, getPos, options),
          { side: -1, key: "card-drag-handle" },
        ),
      );
      return false; // a card is dragged whole - no handles for its regions
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Creates one card's drag-handle element - a small, non-editable grip that starts
 * an external HTML5 drag carrying the card's Auto-Speech-formatted copy. It reads
 * the card's live position through `getPos` (valid across edits), so the handle is
 * never wired to a stale position.
 */
function createCardDragHandle(
  view: EditorView,
  getPos: () => number | undefined,
  options: SpeechTransformOptions,
): HTMLElement {
  const handle = document.createElement("span");
  handle.className = "card-drag-handle";
  handle.setAttribute(CARD_DRAG_HANDLE_ATTR, "");
  handle.setAttribute("draggable", "true");
  handle.setAttribute("contenteditable", "false");
  handle.setAttribute("aria-label", "Drag card into speech");
  handle.title = "Drag into the speech doc";
  handle.textContent = "⠿";

  handle.addEventListener("dragstart", (event) => {
    const pos = getPos();
    if (pos == null || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    const data = buildCardSpeechDragData(view.state.doc, pos, options);
    if (!data) {
      event.preventDefault();
      return;
    }
    writeCardSpeechBlocks(event.dataTransfer, data.blocks);
    event.dataTransfer.effectAllowed = "copy";
    // Stop propagation so ProseMirror's own dragstart (which would start an
    // internal node drag and overwrite our DataTransfer) never runs - this is a
    // pure external drag of our custom payload.
    event.stopPropagation();
  });

  return handle;
}

/** Options for {@link CardSpeechDrag}. */
export interface CardSpeechDragOptions {
  /**
   * How the dragged card is shaped into speech. Defaults to the engine's standard
   * speech (bold tagline + cite + highlighted body, section header preserved).
   */
  transformOptions: SpeechTransformOptions;
}

/**
 * The block-file editor extension that makes cards draggable into a speech doc.
 *
 * Layer it onto the block-file preset's feature-extension seam alongside
 * `blockFileExtensions` / `cardExtensions`. It installs a ProseMirror plugin that
 * renders a per-card drag handle (a view-only widget decoration - no schema or
 * document change) and, on `dragstart` from a handle, writes the card's
 * Auto-Speech-formatted copy onto the drag. The {@link ./card-drop | drop target}
 * on the speech doc consumes it.
 */
export const CardSpeechDrag = Extension.create<CardSpeechDragOptions>({
  name: "cardSpeechDrag",

  addOptions() {
    return { transformOptions: {} };
  },

  addProseMirrorPlugins() {
    const options = this.options.transformOptions;
    return [
      new Plugin({
        key: cardSpeechDragPluginKey,
        props: {
          decorations(state) {
            return cardDragHandleDecorations(state.doc, options);
          },
        },
      }),
    ];
  },
});
