/**
 * The **Contention container** model: the first concrete flow-node kind hosted
 * inside a speech column, and the seam the rest of the Contention & Subpoint
 * PRDs build on.
 *
 * A contention is a large, rounded container a debater drops into a column while
 * flowing - by typing a `C#` trigger (`C1`, `C2`, ...) - to record one line of
 * argument. This module is the container's **data contract**, kept pure (Yjs +
 * the node-container contract only, no React, no canvas): the node kind, its
 * per-node argument-text fragment naming, the trigger parser, and the
 * create/list helpers. The rendering (the XYFlow node + Tiptap surface) and the
 * keyboard wiring live in {@link ../canvas}.
 *
 * ## How a contention is stored (two layers, both already owned)
 *
 * - **Membership + vertical order** ride the existing node-container contract
 *   ({@link ../nodes}): a contention is a {@link FlowNode} of kind
 *   {@link CONTENTION_KIND} in the `nodes` fragment. `addContention` is a thin,
 *   named wrapper over {@link addNode} so contentions get the same
 *   column-membership, ordering, reorder-safe identity, and reload behaviour as
 *   any flow node - this module invents no new membership storage.
 * - **Argument text** lives in the contention's *own* top-level `XmlFragment`,
 *   named {@link contentionContentFragment} (`contention:<nodeId>`). Per the
 *   fragment convention (AGENTS.md), that name binds to `XmlFragment` for the
 *   life of the document; keying it by the node's stable id means each
 *   contention has an independent Tiptap surface that survives reorder and
 *   reload, and no two contentions ever share text. This is the same pattern the
 *   block file uses for its single `body` fragment, generalised per node.
 *
 * ## Designed for nesting (the next slice)
 *
 * Subpoints nest *inside* a contention. This contract stays deliberately minimal
 * so that fits cleanly: a contention is addressed purely by its node id, and its
 * content fragment is derived from that id. The subpoint slice adds its own
 * membership/content keyed off the same node id (a sibling node kind, or nested
 * content under the contention) without changing anything here - exactly as this
 * module added itself on top of {@link ../nodes} without changing that contract.
 *
 * ## The C# trigger, briefly
 *
 * Keyboard speed is the point: a debater types `C1`/`C2` in a focused column and
 * a container appears, no dialog. {@link parseContentionTrigger} is the pure
 * recogniser for that token; the buffering/commit gesture that feeds it live
 * keystrokes is {@link ../canvas/contention-trigger}, and the create call it
 * fires is {@link addContention}.
 */
import type { DocumentHandle } from "../documents/core";
import { addNode, listColumnNodes, type FlowNode } from "./nodes";

/**
 * The {@link FlowNode.kind} discriminator for a contention container. Matches
 * the registered canvas node type that renders it.
 */
export const CONTENTION_KIND = "contention";

/**
 * Prefix of a contention's per-node argument-text fragment name. The full name
 * is {@link contentionContentFragment}; the prefix namespaces it so a
 * contention's content fragment can never collide with the flow sheet's
 * structural fragments (`columns`, `nodes`) or another kind's content.
 */
export const CONTENTION_CONTENT_FRAGMENT_PREFIX = "contention:";

/**
 * The top-level `XmlFragment` name that holds one contention's argument text,
 * derived from the contention's stable node id. Deterministic and node-scoped:
 * the same id always yields the same name (so the surface reloads intact) and
 * distinct ids never share a name (so contentions never bleed content). Binds to
 * `XmlFragment` on first access per the fragment convention - never re-typed.
 *
 * @throws if `nodeId` is empty (a fragment name must be non-empty).
 */
export function contentionContentFragment(nodeId: string): string {
  if (nodeId.length === 0) {
    throw new Error("contentionContentFragment: nodeId must be non-empty");
  }
  return `${CONTENTION_CONTENT_FRAGMENT_PREFIX}${nodeId}`;
}

/**
 * Parses a typed token as a contention trigger. Recognises a single leading `C`
 * (case-insensitive) followed by a positive integer - `C1`, `c2`, `C12` - and
 * returns that number; anything else returns `null`. Surrounding whitespace is
 * trimmed. The number is `C0`-exclusive (a contention is 1-indexed) and rejects
 * signs, letters, or trailing junk, so only a clean `C#` token fires.
 *
 * The returned number is the *typed* contention number - the gesture the debater
 * made. The container's displayed label is derived separately from its position
 * among the column's contentions (see the canvas layer), so in-order flowing
 * (`C1`, `C2`, ...) reads naturally while the model stays free of a stored
 * number.
 */
export function parseContentionTrigger(token: string): number | null {
  const match = /^[Cc]([1-9]\d*)$/.exec(token.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Adds a new contention container to a column and returns its {@link FlowNode}.
 * A thin, named wrapper over {@link addNode} with {@link CONTENTION_KIND}, so the
 * contention is appended to the bottom of the column's vertical sequence with a
 * freshly minted, stable id (the handle its argument-text fragment is keyed by).
 * The argument-text fragment is created lazily on first access by an editor -
 * an empty contention stores no content, exactly like an unopened Tiptap
 * surface.
 */
export function addContention(
  handle: DocumentHandle,
  columnId: string,
): FlowNode {
  return addNode(handle, { columnId, kind: CONTENTION_KIND });
}

/**
 * The contention containers in a column, in vertical order (top-first). A pure
 * filter of {@link listColumnNodes} to {@link CONTENTION_KIND}, so a node's index
 * in this list is its contention rank - what the canvas maps to the `C1`, `C2`
 * label. Non-contention nodes in the same column are ignored; a column with no
 * contentions yields an empty list.
 */
export function listContentions(
  handle: DocumentHandle,
  columnId: string,
): FlowNode[] {
  return listColumnNodes(handle, columnId).filter(
    (node) => node.kind === CONTENTION_KIND,
  );
}
