/**
 * The **Subpoint container** model: the second concrete flow-node kind, nested
 * *inside* a Contention container, and slice 2/3 of the Contention & Subpoint
 * PRD.
 *
 * A subpoint is a small, dark, visually-nested container a debater drops inside a
 * contention while flowing - by typing an `S#` trigger (`S1`, `S2`, ...) - to
 * break an argument into named sub-arguments, each hosting its own text. This
 * module is the container's **data contract**, kept pure (Yjs + the flow-doc only,
 * no React, no canvas): the per-subpoint content-fragment naming, the trigger
 * parser, and the create/list/remove helpers. The rendering (the nested Tiptap
 * surface) and the keyboard wiring live in {@link ./canvas}.
 *
 * ## Nesting is the whole point (and it is enforced)
 *
 * Unlike a {@link ./nodes | flow node}, a subpoint does **not** belong to a
 * column - it belongs to a *contention*. Its membership foreign key is a
 * contention's node id, and {@link addSubpoint} refuses to create one unless that
 * id resolves to a real {@link CONTENTION_KIND} node. There is no API to create a
 * subpoint free of a parent contention, so "subpoints only exist inside a
 * contention" is an invariant of the write seam, not a convention.
 *
 * ## How a subpoint is stored (its own two layers, mirroring the contention)
 *
 * The Contention contract was designed so this slice adds *its own*
 * membership/content keyed off the contention's node id, without changing the
 * node-container contract ({@link ./nodes}) at all - exactly as the contention
 * layered onto `nodes`. So subpoints get a fresh pair of fragments:
 *
 * | Fragment | Yjs type | Meaning |
 * |---|---|---|
 * | `subpoints` | `Y.Map<Y.Map>` | Subpoints keyed by id; each records `contentionId`, `order`. |
 * | `subpoint:<id>` | `Y.XmlFragment` | One subpoint's own text surface. |
 *
 * - **Membership + vertical order** live in the `subpoints` `Y.Map`, keyed by the
 *   subpoint's stable id. Membership is the {@link FlowSubpoint.contentionId}; a
 *   subpoint whose contention is gone is an orphan the canvas simply does not
 *   render (the same discipline `nodes` uses for a missing column). The keyed map
 *   (not an array) means a future reorder rewrites only primitive `order` fields
 *   and never rebuilds a subpoint's map, so its identity and text survive.
 * - **Text** lives in the subpoint's own top-level `XmlFragment`, named
 *   {@link subpointContentFragment} (`subpoint:<id>`) - an independent Tiptap
 *   surface per subpoint, keyed by the stable id so it survives reorder and
 *   reload and no two subpoints ever share text. The `subpoint:` prefix keeps it
 *   from ever colliding with a contention's `contention:` content fragment.
 *
 * Per the fragment convention (AGENTS.md), each name binds to its Yjs type for the
 * life of the document and must never be re-typed or renamed.
 *
 * ## The S# trigger, briefly
 *
 * Keyboard speed is the point: a debater types `S1` *inside* a contention and a
 * nested container appears, no dialog. {@link parseSubpointTrigger} is the pure
 * recogniser for that token; the buffering/commit gesture that feeds it live
 * keystrokes from the contention's editor is {@link ./canvas/subpoint-trigger},
 * and the create call it fires is {@link addSubpoint}.
 */
import * as Y from "yjs";

import type { DocumentHandle } from "../documents/core";
import { CONTENTION_KIND } from "./contention";
import { getNode } from "./nodes";

/** Top-level `Y.Map` fragment name holding the subpoints keyed by id. */
export const FLOW_SUBPOINTS_FRAGMENT = "subpoints";

/**
 * Prefix of a subpoint's per-node text fragment name. The full name is
 * {@link subpointContentFragment}; the prefix namespaces it so a subpoint's text
 * fragment can never collide with the flow sheet's structural fragments
 * (`columns`, `nodes`, `subpoints`) or a contention's `contention:` content.
 */
export const SUBPOINT_CONTENT_FRAGMENT_PREFIX = "subpoint:";

/** Field keys inside a single subpoint's nested `Y.Map`. */
const FIELD = {
  id: "id",
  contentionId: "contentionId",
  order: "order",
} as const;

/**
 * One subpoint's nesting record - the plain read model returned by the helpers
 * here. It is a snapshot: mutating it does not touch the document (use the
 * helpers for that). It records *which contention* a subpoint belongs to and
 * (via its position in {@link listSubpoints}) *where* it sits - never what it
 * contains (that is the subpoint's own text fragment).
 */
export interface FlowSubpoint {
  /**
   * Stable, unique subpoint id. Minted by {@link addSubpoint}, immutable for the
   * life of the subpoint, and the id its text fragment is keyed by. Never reuse
   * or fabricate one.
   */
  readonly id: string;
  /**
   * The parent contention's {@link FlowNode.id | node id} - the nesting foreign
   * key. Always a real contention at creation time; a subpoint whose contention
   * is later removed is an orphan and is not rendered.
   */
  readonly contentionId: string;
}

/**
 * The top-level `XmlFragment` name that holds one subpoint's text, derived from
 * the subpoint's stable id. Deterministic and node-scoped: the same id always
 * yields the same name (so the surface reloads intact) and distinct ids never
 * share a name (so subpoints never bleed content). Binds to `XmlFragment` on
 * first access per the fragment convention - never re-typed.
 *
 * @throws if `nodeId` is empty (a fragment name must be non-empty).
 */
export function subpointContentFragment(nodeId: string): string {
  if (nodeId.length === 0) {
    throw new Error("subpointContentFragment: nodeId must be non-empty");
  }
  return `${SUBPOINT_CONTENT_FRAGMENT_PREFIX}${nodeId}`;
}

/**
 * Parses a typed token as a subpoint trigger. Recognises a single leading `S`
 * (case-insensitive) followed by a positive integer - `S1`, `s2`, `S12` - and
 * returns that number; anything else (including a `C#` contention token) returns
 * `null`. Surrounding whitespace is trimmed. The number is `S0`-exclusive (a
 * subpoint is 1-indexed) and rejects signs, letters, or trailing junk, so only a
 * clean `S#` token fires.
 *
 * The returned number is the *typed* subpoint number - the gesture the debater
 * made. The container's displayed label is derived separately from its position
 * among the contention's subpoints (see the canvas layer), so in-order flowing
 * (`S1`, `S2`, ...) reads naturally while the model stays free of a stored number.
 */
export function parseSubpointTrigger(token: string): number | null {
  const match = /^[Ss]([1-9]\d*)$/.exec(token.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Returns the document's top-level `subpoints` `Y.Map`. Accessing it binds the
 * name as a `Y.Map` for the life of the doc (the fragment convention), so this is
 * the *only* accessor used on `subpoints`.
 */
function subpointsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(FLOW_SUBPOINTS_FRAGMENT);
}

/** Reads a subpoint's nested `Y.Map` into a plain {@link FlowSubpoint} snapshot. */
function readSubpoint(map: Y.Map<unknown>): FlowSubpoint {
  return {
    id: map.get(FIELD.id) as string,
    contentionId: map.get(FIELD.contentionId) as string,
  };
}

/** Reads a subpoint's raw `order` value (internal sequencing detail). */
function readOrder(map: Y.Map<unknown>): number {
  return map.get(FIELD.order) as number;
}

/**
 * Compares two nested subpoint maps for a stable total order: ascending `order`,
 * tie-broken by id. Used to sequence a contention's subpoints vertically.
 */
function byOrderThenId(a: Y.Map<unknown>, b: Y.Map<unknown>): number {
  const byOrder = readOrder(a) - readOrder(b);
  if (byOrder !== 0) return byOrder;
  return (a.get(FIELD.id) as string).localeCompare(b.get(FIELD.id) as string);
}

/** The nested maps belonging to `contentionId`, in vertical (order) order. */
function contentionSubpointMaps(
  map: Y.Map<Y.Map<unknown>>,
  contentionId: string,
): Y.Map<unknown>[] {
  const maps: Y.Map<unknown>[] = [];
  map.forEach((sub) => {
    if (sub.get(FIELD.contentionId) === contentionId) maps.push(sub);
  });
  return maps.sort(byOrderThenId);
}

/**
 * The subpoints nested under a contention, in vertical order (top-first). This
 * *is* the contention's subpoint sequence - a subpoint's index in this list is
 * its rank, which the canvas maps to its `S1`, `S2` label. A contention with no
 * subpoints yields an empty list.
 */
export function listSubpoints(
  handle: DocumentHandle,
  contentionId: string,
): FlowSubpoint[] {
  return contentionSubpointMaps(subpointsMap(handle.doc), contentionId).map(
    readSubpoint,
  );
}

/** The subpoint with `id`, or `undefined` if none exists. */
export function getSubpoint(
  handle: DocumentHandle,
  id: string,
): FlowSubpoint | undefined {
  const map = subpointsMap(handle.doc).get(id);
  return map ? readSubpoint(map) : undefined;
}

/**
 * Adds a new subpoint nested under a contention with a freshly minted id,
 * appended to the bottom of that contention's subpoint sequence, and returns it.
 * Written in one transaction so observers never see a half-built subpoint.
 *
 * **Nesting is enforced here:** `contentionId` must resolve to a live
 * {@link CONTENTION_KIND} node, otherwise this throws. That is the invariant
 * behind "subpoints only exist inside a contention" - there is no way to create
 * an orphan subpoint. Its text fragment is created lazily on first access by an
 * editor, so an empty subpoint stores no text.
 *
 * @throws if `contentionId` does not resolve to a contention node.
 */
export function addSubpoint(
  handle: DocumentHandle,
  contentionId: string,
): FlowSubpoint {
  const parent = getNode(handle, contentionId);
  if (!parent || parent.kind !== CONTENTION_KIND) {
    throw new Error(
      `addSubpoint: no contention with id "${contentionId}" - subpoints must nest inside a contention`,
    );
  }
  const subpoint: FlowSubpoint = {
    id: crypto.randomUUID(),
    contentionId,
  };
  const map = subpointsMap(handle.doc);
  const siblings = contentionSubpointMaps(map, contentionId);
  const order =
    siblings.length === 0 ? 0 : readOrder(siblings[siblings.length - 1]) + 1;
  handle.doc.transact(() => {
    const nested = new Y.Map<unknown>();
    nested.set(FIELD.id, subpoint.id);
    nested.set(FIELD.contentionId, subpoint.contentionId);
    nested.set(FIELD.order, order);
    map.set(subpoint.id, nested);
  });
  return subpoint;
}

/** Removes the subpoint with `id`. A no-op if no such subpoint exists. */
export function removeSubpoint(handle: DocumentHandle, id: string): void {
  const map = subpointsMap(handle.doc);
  if (!map.has(id)) return;
  map.delete(id);
}

/**
 * Subscribes to a flow sheet's subpoints: invokes `listener` immediately and
 * again after every change - add, remove, membership, or order. Returns an
 * unsubscribe function.
 *
 * Mirrors {@link observeNodes}: it observes the `subpoints` map deeply, so a
 * reorder (a change inside a nested subpoint map) fires too, not just structural
 * add/remove. Changes to other fragments do not fire it. The listener is passed
 * no argument (like the canvas consumers of this observer, it re-reads via
 * {@link listSubpoints} against the contention it cares about).
 */
export function observeSubpoints(
  handle: DocumentHandle,
  listener: () => void,
): () => void {
  const map = subpointsMap(handle.doc);
  const observer = () => listener();
  map.observeDeep(observer);
  listener();
  return () => map.unobserveDeep(observer);
}
