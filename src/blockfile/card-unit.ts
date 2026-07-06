/**
 * The card-as-a-unit addressability API.
 *
 * The {@link ./card | card node model} defines a card's *anatomy* - one `card`
 * container holding exactly four region nodes (tag, tagline, cite, body) in order.
 * This module is the pure query/selection seam that lets tooling treat that
 * anatomy as an addressable **unit**: given a position, find the card that
 * contains it; select a whole card programmatically; and read or serialize a
 * card's four regions individually or together.
 *
 * It is the contract the card-cutting tools (Extract, Send to Block File) and the
 * drag-to-speech pipeline target - so it is deliberately a small set of pure
 * functions over ProseMirror state, in the same discipline as the
 * {@link ../editor/headings/outline | outline query}, the {@link ./sections |
 * side-region helpers}, and the {@link ../documents/registry/query |
 * recent-documents query}. There is nothing to keep in sync and nothing to
 * invalidate: every function derives its answer from the document (or editor)
 * passed in.
 *
 * ## Two halves: positional location vs. content reading
 *
 * - **Location** ({@link cardAt} / {@link getCardAt} / {@link getSelectedCard})
 *   resolves a position to the {@link LocatedCard} that encloses it, carrying the
 *   card node plus the ProseMirror positions that address the whole card and each
 *   of its regions. Positions are the currency of *selection* and *range* edits
 *   (what {@link selectCard} and the cutting tools act on).
 * - **Reading** ({@link readCardRegionText}, {@link serializeCardRegion},
 *   {@link readCardRegions}, {@link serializeCard}) works purely on a card
 *   ProseMirror node - no positions, no editor - and produces plain text or
 *   document-JSON. This is what a pipeline serializes when it moves a card's
 *   content somewhere else (a speech doc, another block file).
 *
 * ## Position semantics
 *
 * Every position a {@link LocatedCard} carries is a ProseMirror position in the
 * document it was read from, valid only against that document version - any edit
 * can shift it. Re-derive after edits (call {@link getCardAt} again). This is the
 * same snapshot discipline the outline query, the side-region helpers, and the
 * argument-section query all document.
 */
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import {
  CARD_NODE_NAME,
  CARD_TAG_NODE_NAME,
  CARD_TAGLINE_NODE_NAME,
  CARD_CITE_NODE_NAME,
  CARD_BODY_NODE_NAME,
} from "./card";

/**
 * The four card regions, addressed by a short stable key rather than their
 * ProseMirror node-type name. `key` is the ergonomic handle a consumer uses
 * (`regions.body`, `readCardRegionText(card, "cite")`); the node names remain the
 * schema contract the model owns.
 */
export type CardRegionKey = "tag" | "tagline" | "cite" | "body";

/**
 * The region keys in card (document) order - the order the card's content
 * expression enforces. Stable; the same order {@link LocatedCard.regions} and the
 * card schema use.
 */
export const CARD_REGION_KEYS: readonly CardRegionKey[] = [
  "tag",
  "tagline",
  "cite",
  "body",
];

/** Maps each region key to its schema node-type name. */
const REGION_NODE_NAME: Record<CardRegionKey, string> = {
  tag: CARD_TAG_NODE_NAME,
  tagline: CARD_TAGLINE_NODE_NAME,
  cite: CARD_CITE_NODE_NAME,
  body: CARD_BODY_NODE_NAME,
};

/** Reverse lookup: schema node-type name to region key (or undefined). */
const REGION_KEY_BY_NODE: Record<string, CardRegionKey> = {
  [CARD_TAG_NODE_NAME]: "tag",
  [CARD_TAGLINE_NODE_NAME]: "tagline",
  [CARD_CITE_NODE_NAME]: "cite",
  [CARD_BODY_NODE_NAME]: "body",
};

/**
 * One located region of a card: its key, its node, and the range it occupies.
 *
 * `from`/`to` bound the region *node* (`from` is the position immediately before
 * it, `to` immediately after). The region's editable content sits at
 * `[from + 1, to - 1]` - the range to set a selection inside the region. Use the
 * node for reading/serialization; use the range for selecting or replacing.
 */
export interface LocatedCardRegion {
  /** Which region this is. */
  key: CardRegionKey;
  /** The region's ProseMirror node (`cardTag` / `cardTagline` / `cardCite` / `cardBody`). */
  node: ProseMirrorNode;
  /** Position immediately before the region node. */
  from: number;
  /** Position immediately after the region node (`from + node.nodeSize`). */
  to: number;
}

/**
 * A card located as a unit: the card node plus the positions that address the
 * whole card and each of its four regions.
 *
 * `from`/`to` bound the whole card node - `from` is the position immediately
 * before it (create a {@link https://prosemirror.net/docs/ref/#state.NodeSelection
 * | NodeSelection} here to select the card, which is what {@link selectCard}
 * does), `to` the position immediately after. `[from, to]` is the range the
 * cutting tools replace or slice to move a card as one piece.
 */
export interface LocatedCard {
  /** The `card` container node. */
  node: ProseMirrorNode;
  /** Position immediately before the card node - the NodeSelection anchor. */
  from: number;
  /** Position immediately after the card node (`from + node.nodeSize`). */
  to: number;
  /** The card's four regions, keyed for direct access (e.g. `regions.body`). */
  regions: Record<CardRegionKey, LocatedCardRegion>;
}

/** Build a {@link LocatedCard} from a card node known to start at `from`. */
function locateCard(card: ProseMirrorNode, from: number): LocatedCard {
  const regions = {} as Record<CardRegionKey, LocatedCardRegion>;
  // Child region positions are offset from the first position inside the card.
  let offset = from + 1;
  card.forEach((child) => {
    const key = REGION_KEY_BY_NODE[child.type.name];
    if (key) {
      regions[key] = {
        key,
        node: child,
        from: offset,
        to: offset + child.nodeSize,
      };
    }
    offset += child.nodeSize;
  });
  return { node: card, from, to: from + card.nodeSize, regions };
}

/**
 * Locates the `card` node that encloses `pos` in `doc`, or `null` if `pos` is not
 * inside any card. Pure over the document node - the seam {@link getCardAt} and
 * {@link getSelectedCard} build on, and the form to use when holding a document
 * parsed from persisted JSON rather than a live editor.
 *
 * A position resolves to a card when the card is one of its ancestors - i.e. the
 * position sits anywhere inside the card (in any region, or between them). An
 * out-of-range or non-integer `pos` yields `null` rather than throwing, so a
 * caller can pass a raw selection position without pre-validating it.
 */
export function cardAt(doc: ProseMirrorNode, pos: number): LocatedCard | null {
  if (!Number.isInteger(pos) || pos < 0 || pos > doc.content.size) return null;

  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const node = $pos.node(depth);
    if (node.type.name === CARD_NODE_NAME) {
      return locateCard(node, $pos.before(depth));
    }
  }
  return null;
}

/**
 * Locates the card enclosing `pos` in the editor's current document. The editor
 * convenience form of {@link cardAt}; equivalent to
 * `cardAt(editor.state.doc, pos)`.
 */
export function getCardAt(editor: Editor, pos: number): LocatedCard | null {
  return cardAt(editor.state.doc, pos);
}

/**
 * Locates the card the editor's current selection is in, or `null` if it is not
 * in a card. Handles both an ordinary cursor/text selection inside a card and a
 * {@link https://prosemirror.net/docs/ref/#state.NodeSelection | NodeSelection}
 * *on* a card (as {@link selectCard} leaves it) - the latter's anchor sits before
 * the card, so it is matched explicitly rather than by ancestor resolution.
 *
 * This is the "the card I'm working in" seam a cutting tool or context menu reads
 * off the current selection.
 */
export function getSelectedCard(editor: Editor): LocatedCard | null {
  const { selection } = editor.state;
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === CARD_NODE_NAME
  ) {
    return locateCard(selection.node, selection.from);
  }
  return cardAt(editor.state.doc, selection.from);
}

/**
 * Selects the whole card at `pos` (or, when `pos` is omitted, the card enclosing
 * the current selection) as a single
 * {@link https://prosemirror.net/docs/ref/#state.NodeSelection | NodeSelection},
 * so subsequent commands (delete, replace, copy) act on the card as one unit.
 * Returns `true` if a card was found and selected, `false` (a no-op) otherwise.
 *
 * It sets the selection only - it does not focus - so it composes cleanly with a
 * tool that immediately transforms the selection. The transaction is an ordinary
 * ProseMirror selection change, undoable through the collaboration binding's Yjs
 * history like every other editor mutation.
 */
export function selectCard(editor: Editor, pos?: number): boolean {
  const located =
    pos === undefined ? getSelectedCard(editor) : getCardAt(editor, pos);
  if (!located) return false;

  return editor
    .chain()
    .command(({ tr, dispatch }) => {
      if (dispatch) {
        tr.setSelection(NodeSelection.create(tr.doc, located.from));
      }
      return true;
    })
    .run();
}

/** Throw if `card` is not a `card` node; return its region child for `key`. */
function regionChild(
  card: ProseMirrorNode,
  key: CardRegionKey,
  op: string,
): ProseMirrorNode {
  if (card.type.name !== CARD_NODE_NAME) {
    throw new Error(
      `${op}: expected a "${CARD_NODE_NAME}" node, got "${card.type.name}".`,
    );
  }
  const name = REGION_NODE_NAME[key];
  let found: ProseMirrorNode | null = null;
  card.forEach((child) => {
    if (!found && child.type.name === name) found = child;
  });
  if (!found) {
    throw new Error(
      `${op}: card is missing its "${key}" region - not a well-formed card node.`,
    );
  }
  return found;
}

/**
 * Reads one region's plain text (inline marks flattened; for the body, its
 * paragraphs joined). Pure over a card node. Throws if `card` is not a card node.
 *
 * Text is the right read for the three single-line header regions (which carry no
 * marks by schema); for the body's formatting, serialize it instead with
 * {@link serializeCardRegion} to keep bold/highlight.
 */
export function readCardRegionText(
  card: ProseMirrorNode,
  key: CardRegionKey,
): string {
  return regionChild(card, key, "readCardRegionText").textContent;
}

/**
 * Serializes one region node to document-JSON (structure + marks preserved), the
 * form the drag-to-speech pipeline and cutting tools move around. Pure over a card
 * node. Throws if `card` is not a card node.
 *
 * For the body this preserves the paragraphs and their bold/highlight marks; for
 * the header regions it is the region node with its bare text.
 */
export function serializeCardRegion(
  card: ProseMirrorNode,
  key: CardRegionKey,
): JSONContent {
  return regionChild(card, key, "serializeCardRegion").toJSON() as JSONContent;
}

/**
 * A whole card read as a structured snapshot: the three single-line header
 * regions as plain text (they carry no marks by schema, so text is lossless), and
 * the body as document-JSON so its paragraph structure and bold/highlight marks
 * survive. This is the ergonomic shape a pipeline reads when it needs every region
 * of a card at once (mirroring {@link ./card.CardFields | CardFields}, but with a
 * fully-serialized body).
 */
export interface CardRegionsSnapshot {
  /** The bare tag token (no brackets - as stored). */
  tag: string;
  /** The tagline text. */
  tagline: string;
  /** The cite text. */
  cite: string;
  /** The body region node's document-JSON, marks intact. */
  body: JSONContent;
}

/**
 * Reads all four regions of a card at once into a {@link CardRegionsSnapshot} -
 * header regions as text, body as JSON. Pure over a card node. Throws if `card` is
 * not a card node.
 */
export function readCardRegions(card: ProseMirrorNode): CardRegionsSnapshot {
  return {
    tag: readCardRegionText(card, "tag"),
    tagline: readCardRegionText(card, "tagline"),
    cite: readCardRegionText(card, "cite"),
    body: serializeCardRegion(card, "body"),
  };
}

/**
 * Serializes the whole card to one document-JSON node - the re-insertable unit the
 * cutting tools move (`editor.commands.insertContent(serializeCard(card))` lands a
 * structurally identical card elsewhere). Pure over a card node. Throws if `card`
 * is not a card node.
 */
export function serializeCard(card: ProseMirrorNode): JSONContent {
  if (card.type.name !== CARD_NODE_NAME) {
    throw new Error(
      `serializeCard: expected a "${CARD_NODE_NAME}" node, got "${card.type.name}".`,
    );
  }
  return card.toJSON() as JSONContent;
}
