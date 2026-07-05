/**
 * The flow-sheet **node-container contract**: how a flow node records which
 * speech column it belongs to and where it sits vertically within that column.
 *
 * This is the stable seam every later flow-node PRD (contentions, subpoints,
 * argument rows) builds on. A flow sheet's spine is the ordered list of speech
 * columns ({@link ./columns}); this module is the second layer - the membership
 * and vertical-ordering model for the *nodes* those columns host. It is content-
 * agnostic on purpose: a node records only its identity, its column, its kind,
 * and its order. What a "contention" or "argument row" actually *contains* is
 * each node kind's own concern (its PRD stores that content elsewhere - a
 * separate fragment or an owned nested slot), so this contract can stay fixed
 * while node kinds proliferate.
 *
 * ## Where the nodes live (fragment convention)
 *
 * Per the document-model contract (see AGENTS.md), a kind's content lives under
 * named top-level shared types ("fragments") on the document's `Y.Doc`, and each
 * fragment is owned by exactly one PRD. This contract claims a *new* fragment on
 * the `flow-sheet` kind, distinct from the `columns` fragment the column model
 * owns:
 *
 * | Fragment | Yjs type | Meaning |
 * |---|---|---|
 * | `nodes` | `Y.Map<Y.Map>` | Flow nodes keyed by id; each map records `columnId`, `kind`, `order`. |
 *
 * `nodes` is a keyed `Y.Map` (not a `Y.Array` like `columns`) deliberately: a
 * node owns rich content that a later PRD attaches, and reordering must **never**
 * rebuild the node's map (Yjs cannot re-position an integrated shared type, so a
 * `Y.Array` reorder would force a rebuild that a deep content clone can't survive
 * cleanly). Keying by id and expressing vertical order in a plain `order` field
 * means a move only rewrites primitive `order` values - the node's identity and
 * any attached content stay put. Yjs binds `nodes` to `Y.Map` for the life of
 * the document; it must never be re-typed or renamed.
 *
 * ## Membership and ordering
 *
 * - **Membership** is the {@link FlowNode.columnId | columnId} foreign key: it is
 *   a {@link SpeechColumn.id} from the same document's column list. A node whose
 *   column no longer exists is an *orphan*; this layer never cascades a column
 *   removal (that lifecycle choice belongs to the consuming feature), and the
 *   canvas host simply does not render a node whose column is gone.
 * - **Vertical order** within a column is the ascending `order` field, tie-broken
 *   by id for a stable total order. The raw `order` value is an internal
 *   sequencing detail and is *not* part of the {@link FlowNode} snapshot: callers
 *   get vertical position from a node's index in {@link listColumnNodes}, so the
 *   ordering scheme can evolve without changing the public shape.
 *
 * ## Node identity
 *
 * Each node carries a stable {@link FlowNode.id | id} minted by {@link addNode}
 * (`crypto.randomUUID`). It is immutable for the node's life, preserved across
 * reorder and reload, and retired permanently on remove. It is the id the canvas
 * uses as the XYFlow node id and the handle a node kind uses to find its own
 * content, so never reuse or fabricate one outside {@link addNode}.
 *
 * ## Local-first, never network
 *
 * Helpers mutate Yjs shared types on `handle.doc`, which the document layer
 * persists to IndexedDB - so every change survives a reload with no network
 * involved. Edits flow through the document's `update` stream just like column
 * edits, so a registry that `track`s the handle bumps last-edited automatically;
 * this module never touches the registry.
 */
import * as Y from "yjs";

import type { DocumentHandle } from "../documents/core";

/** Top-level `Y.Map` fragment name holding the flow nodes keyed by id. */
export const FLOW_NODES_FRAGMENT = "nodes";

/** Field keys inside a single node's nested `Y.Map`. */
const FIELD = {
  id: "id",
  columnId: "columnId",
  kind: "kind",
  order: "order",
} as const;

/**
 * One flow node's membership record - the plain read model returned by the
 * helpers here. It is a snapshot: mutating it does not touch the document (use
 * the helpers for that).
 *
 * The record is deliberately content-free. It says *which* column a node is in,
 * *what kind* it is, and (via its position in {@link listColumnNodes}) *where* it
 * sits - never what it contains. A node kind's own content is that kind's PRD to
 * define and store.
 */
export interface FlowNode {
  /**
   * Stable, unique node id. Minted by {@link addNode}, immutable for the life of
   * the node, and the id the canvas host uses as the XYFlow node id. Never reuse
   * or fabricate one.
   */
  readonly id: string;
  /**
   * The {@link SpeechColumn.id} of the column this node belongs to - the
   * membership foreign key. A node whose column no longer exists is an orphan
   * and is not rendered.
   */
  readonly columnId: string;
  /**
   * The node kind, matching a node type registered with the canvas (e.g. a
   * future `"contention"`). The canvas host looks this up to pick the component
   * that renders the node.
   */
  readonly kind: string;
}

/** Fields accepted when adding a new node; the id and order are assigned. */
export interface AddNodeInput {
  /** The column the new node belongs to (a {@link SpeechColumn.id}). */
  columnId: string;
  /** The node kind (matches a registered canvas node type). */
  kind: string;
}

/**
 * Returns the document's top-level `nodes` `Y.Map`. Accessing it binds the name
 * as a `Y.Map` for the life of the doc (the fragment convention), so this is the
 * *only* accessor used on `nodes`.
 */
function nodesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(FLOW_NODES_FRAGMENT);
}

/** Reads a node's nested `Y.Map` into a plain {@link FlowNode} snapshot. */
function readNode(map: Y.Map<unknown>): FlowNode {
  return {
    id: map.get(FIELD.id) as string,
    columnId: map.get(FIELD.columnId) as string,
    kind: map.get(FIELD.kind) as string,
  };
}

/** Reads a node's raw `order` value (internal sequencing detail). */
function readOrder(map: Y.Map<unknown>): number {
  return map.get(FIELD.order) as number;
}

/**
 * Compares two nested node maps for a stable total order: ascending `order`,
 * tie-broken by id. Used to sequence a column's nodes vertically.
 */
function byOrderThenId(a: Y.Map<unknown>, b: Y.Map<unknown>): number {
  const byOrder = readOrder(a) - readOrder(b);
  if (byOrder !== 0) return byOrder;
  return (a.get(FIELD.id) as string).localeCompare(b.get(FIELD.id) as string);
}

/** The nested maps belonging to `columnId`, in vertical (order) order. */
function columnNodeMaps(
  map: Y.Map<Y.Map<unknown>>,
  columnId: string,
): Y.Map<unknown>[] {
  const maps: Y.Map<unknown>[] = [];
  map.forEach((node) => {
    if (node.get(FIELD.columnId) === columnId) maps.push(node);
  });
  return maps.sort(byOrderThenId);
}

/**
 * Every flow node on a flow-sheet document, as plain snapshots. A pure read of
 * current state, ordered deterministically by column id (lexicographic) then
 * vertical position then id - a stable total order across the whole document.
 * Safe to call any time after the handle's local load has resolved.
 */
export function listNodes(handle: DocumentHandle): FlowNode[] {
  const map = nodesMap(handle.doc);
  const maps: Y.Map<unknown>[] = [];
  map.forEach((node) => maps.push(node));
  return maps
    .sort((a, b) => {
      const byColumn = (a.get(FIELD.columnId) as string).localeCompare(
        b.get(FIELD.columnId) as string,
      );
      return byColumn !== 0 ? byColumn : byOrderThenId(a, b);
    })
    .map(readNode);
}

/**
 * The nodes belonging to `columnId`, in vertical order (top-first). This *is*
 * the column's vertical sequence - a node's index in this list is its vertical
 * position, which is what the canvas host maps to a y-offset. A column with no
 * nodes yields an empty list.
 */
export function listColumnNodes(
  handle: DocumentHandle,
  columnId: string,
): FlowNode[] {
  return columnNodeMaps(nodesMap(handle.doc), columnId).map(readNode);
}

/** The node with `id`, or `undefined` if none exists. */
export function getNode(
  handle: DocumentHandle,
  id: string,
): FlowNode | undefined {
  const map = nodesMap(handle.doc).get(id);
  return map ? readNode(map) : undefined;
}

/**
 * Adds a new node to a column with a freshly minted id, appended to the bottom
 * of that column's vertical sequence, and returns it. Written in one transaction
 * so observers never see a half-built node.
 *
 * Membership is not validated against the column list here - a caller is
 * expected to pass a live {@link SpeechColumn.id}; a node pointing at a missing
 * column is simply an orphan the canvas will not render.
 */
export function addNode(
  handle: DocumentHandle,
  input: AddNodeInput,
): FlowNode {
  const node: FlowNode = {
    id: crypto.randomUUID(),
    columnId: input.columnId,
    kind: input.kind,
  };
  const map = nodesMap(handle.doc);
  // Append to the bottom: order is the count of the column's current nodes, so
  // it sorts after every existing sibling.
  const order = columnNodeMaps(map, input.columnId).length;
  handle.doc.transact(() => {
    const nested = new Y.Map<unknown>();
    nested.set(FIELD.id, node.id);
    nested.set(FIELD.columnId, node.columnId);
    nested.set(FIELD.kind, node.kind);
    nested.set(FIELD.order, order);
    map.set(node.id, nested);
  });
  return node;
}

/**
 * Moves the node with `id` to vertical index `toIndex` within *its own column*,
 * shifting its siblings to fill the gap. `toIndex` is clamped to a valid
 * position, so a drop index can be passed raw. Throws if no such node exists; a
 * no-op move (already at the clamped target) leaves the document untouched.
 *
 * Unlike a column move, this never rebuilds the node's map: it only rewrites the
 * primitive `order` fields of the column's nodes, so the node's identity and any
 * attached content are untouched. The whole renumber happens in one transaction.
 */
export function moveNode(
  handle: DocumentHandle,
  id: string,
  toIndex: number,
): void {
  const map = nodesMap(handle.doc);
  const target = map.get(id);
  if (!target) {
    throw new Error(`moveNode: no node with id "${id}"`);
  }
  const columnId = target.get(FIELD.columnId) as string;
  const siblings = columnNodeMaps(map, columnId);
  const from = siblings.findIndex((m) => m.get(FIELD.id) === id);
  const to = Math.max(0, Math.min(toIndex, siblings.length - 1));
  if (to === from) return;

  // Rebuild the ordered sequence with the node moved, then renumber 0..n-1.
  const reordered = siblings.slice();
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  handle.doc.transact(() => {
    reordered.forEach((m, index) => m.set(FIELD.order, index));
  });
}

/** Removes the node with `id`. A no-op if no such node exists. */
export function removeNode(handle: DocumentHandle, id: string): void {
  const map = nodesMap(handle.doc);
  if (!map.has(id)) return;
  map.delete(id);
}

/**
 * Subscribes to a flow sheet's nodes: invokes `listener` with a fresh snapshot
 * of every node immediately and again after every change - add, move (order),
 * membership, or remove. Returns an unsubscribe function.
 *
 * Mirrors {@link observeColumns}: the snapshot is a pure derivation of current
 * state ({@link listNodes}), so the consumer never manages invalidation. It
 * observes the `nodes` map deeply, so a reorder (a change inside a nested node
 * map) fires too, not just structural add/remove. Changes to other fragments -
 * the `columns` list, or content fragments a node kind adds - do not fire it.
 */
export function observeNodes(
  handle: DocumentHandle,
  listener: (nodes: FlowNode[]) => void,
): () => void {
  const map = nodesMap(handle.doc);
  const emit = () => listener(listNodes(handle));
  const observer = () => emit();
  map.observeDeep(observer);
  emit();
  return () => map.unobserveDeep(observer);
}
