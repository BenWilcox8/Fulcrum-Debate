/**
 * The flow-sheet **edge model**: how the flow sheet records a directed
 * relationship *between two flow nodes* - the first being cross-application
 * (drag an argument to another column and an arrow points from the original to
 * the copy).
 *
 * The node-container contract ({@link ./nodes}) models which column a node
 * belongs to and where it sits; this module is the orthogonal layer - the
 * *connections* drawn between nodes, independent of any column. It is content-
 * agnostic and kind-tagged: an edge records only its identity, its two
 * endpoints (by stable node id), and a `kind` discriminator, so the same
 * fragment can carry future edge kinds (rebuttal links, grouping, ...) without a
 * schema change.
 *
 * ## Where the edges live (fragment convention)
 *
 * Per the document-model contract (see AGENTS.md), each kind of content lives
 * under a named top-level shared type ("fragment") on the document's `Y.Doc`,
 * owned by exactly one PRD. This claims a *new* fragment on the `flow-sheet`
 * kind, a sibling of `columns`, `nodes`, and `subpoints`:
 *
 * | Fragment | Yjs type | Meaning |
 * |---|---|---|
 * | `edges` | `Y.Map<Y.Map>` | Flow edges keyed by id; each records `sourceNodeId`, `targetNodeId`, `kind`. |
 *
 * `edges` is a keyed `Y.Map` (not a `Y.Array`) so a future removal or reorder
 * never rebuilds an edge's map, mirroring the `nodes` and `subpoints` stores.
 * Yjs binds `edges` to `Y.Map` for the life of the document; it must never be
 * re-typed or renamed.
 *
 * ## Endpoints are node ids, never validated here
 *
 * An edge's {@link FlowEdge.sourceNodeId} / {@link FlowEdge.targetNodeId} are
 * {@link FlowNode.id}s from the same document. Like the `nodes` layer, this
 * module does **not** validate that they resolve to live nodes - an edge whose
 * endpoint is gone is simply not drawn by the canvas (the same graceful-orphan
 * discipline the node host uses for a missing column). Endpoint lifecycle
 * (cascading an edge removal when a node is deleted) is a consuming feature's
 * concern, not this seam's.
 *
 * ## Local-first, never network
 *
 * Helpers mutate Yjs shared types on `handle.doc`, which the document layer
 * persists to IndexedDB - so every edge survives a reload with no network
 * involved, exactly like the node and column models.
 */
import * as Y from "yjs";

import type { DocumentHandle } from "../documents/core";

/** Top-level `Y.Map` fragment name holding the flow edges keyed by id. */
export const FLOW_EDGES_FRAGMENT = "edges";

/**
 * The {@link FlowEdge.kind} discriminator for a cross-application edge: the
 * transparent arrow that points from an argument to the copy a debater dropped
 * in another column. The only edge kind for now; the field exists so later edge
 * kinds cost no schema change.
 */
export const CROSS_APPLICATION_EDGE_KIND = "cross-application";

/** Field keys inside a single edge's nested `Y.Map`. */
const FIELD = {
  id: "id",
  sourceNodeId: "sourceNodeId",
  targetNodeId: "targetNodeId",
  kind: "kind",
} as const;

/**
 * One flow edge's record - the plain read model returned by the helpers here. A
 * snapshot: mutating it does not touch the document (use the helpers for that).
 * It says which two nodes the edge connects and what kind of connection it is,
 * never anything about their content or layout.
 */
export interface FlowEdge {
  /**
   * Stable, unique edge id. Minted by {@link addEdge}, immutable for the life of
   * the edge. Never reuse or fabricate one.
   */
  readonly id: string;
  /** The {@link FlowNode.id} the edge points *from* (the original argument). */
  readonly sourceNodeId: string;
  /** The {@link FlowNode.id} the edge points *to* (the dropped copy). */
  readonly targetNodeId: string;
  /** The edge kind (e.g. {@link CROSS_APPLICATION_EDGE_KIND}). */
  readonly kind: string;
}

/** Fields accepted when adding a new edge; the id is minted and the kind defaults. */
export interface AddEdgeInput {
  /** The node the edge points from. */
  sourceNodeId: string;
  /** The node the edge points to. */
  targetNodeId: string;
  /** The edge kind. Defaults to {@link CROSS_APPLICATION_EDGE_KIND}. */
  kind?: string;
}

/**
 * Returns the document's top-level `edges` `Y.Map`. Accessing it binds the name
 * as a `Y.Map` for the life of the doc (the fragment convention), so this is the
 * *only* accessor used on `edges`.
 */
function edgesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(FLOW_EDGES_FRAGMENT);
}

/** Reads an edge's nested `Y.Map` into a plain {@link FlowEdge} snapshot. */
function readEdge(map: Y.Map<unknown>): FlowEdge {
  return {
    id: map.get(FIELD.id) as string,
    sourceNodeId: map.get(FIELD.sourceNodeId) as string,
    targetNodeId: map.get(FIELD.targetNodeId) as string,
    kind: map.get(FIELD.kind) as string,
  };
}

/**
 * Every flow edge on a flow-sheet document, as plain snapshots, ordered
 * deterministically by id (lexicographic) for a stable total order. A pure read
 * of current state; safe to call any time after the handle's local load has
 * resolved.
 */
export function listEdges(handle: DocumentHandle): FlowEdge[] {
  const map = edgesMap(handle.doc);
  const edges: FlowEdge[] = [];
  map.forEach((edge) => edges.push(readEdge(edge)));
  return edges.sort((a, b) => a.id.localeCompare(b.id));
}

/** The edge with `id`, or `undefined` if none exists. */
export function getEdge(
  handle: DocumentHandle,
  id: string,
): FlowEdge | undefined {
  const map = edgesMap(handle.doc).get(id);
  return map ? readEdge(map) : undefined;
}

/**
 * Adds a new edge between two nodes with a freshly minted id and returns it.
 * Written in one transaction so observers never see a half-built edge. Endpoints
 * are not validated against the node list (see the module docblock); a caller is
 * expected to pass live {@link FlowNode.id}s.
 */
export function addEdge(handle: DocumentHandle, input: AddEdgeInput): FlowEdge {
  const edge: FlowEdge = {
    id: crypto.randomUUID(),
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId,
    kind: input.kind ?? CROSS_APPLICATION_EDGE_KIND,
  };
  const map = edgesMap(handle.doc);
  handle.doc.transact(() => {
    const nested = new Y.Map<unknown>();
    nested.set(FIELD.id, edge.id);
    nested.set(FIELD.sourceNodeId, edge.sourceNodeId);
    nested.set(FIELD.targetNodeId, edge.targetNodeId);
    nested.set(FIELD.kind, edge.kind);
    map.set(edge.id, nested);
  });
  return edge;
}

/** Removes the edge with `id`. A no-op if no such edge exists. */
export function removeEdge(handle: DocumentHandle, id: string): void {
  const map = edgesMap(handle.doc);
  if (!map.has(id)) return;
  map.delete(id);
}

/**
 * Subscribes to a flow sheet's edges: invokes `listener` immediately and again
 * after every change - add or remove. Returns an unsubscribe function. Mirrors
 * {@link observeNodes}: it observes the `edges` map deeply, so a change inside a
 * nested edge map fires too. The listener is passed no argument (consumers
 * re-read via {@link listEdges}).
 */
export function observeEdges(
  handle: DocumentHandle,
  listener: () => void,
): () => void {
  const map = edgesMap(handle.doc);
  const observer = () => listener();
  map.observeDeep(observer);
  listener();
  return () => map.unobserveDeep(observer);
}
