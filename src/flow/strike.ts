/**
 * The flow-sheet **strike** state: a non-destructive flag marking a flow node
 * (an argument) as *struck* - the debate move where a debater, having answered
 * an opponent's argument, crosses it out to show it is refuted. It is the second
 * half of the DnD/Strike clash workflow: dropping an argument *adjacent* to an
 * opponent's argument both cross-applies it ({@link ./cross-apply}) and strikes
 * that opponent argument.
 *
 * ## Why a flag on the node, not a new fragment
 *
 * A strike is a property *of one node*, not a relationship between two (unlike an
 * {@link ./edges | edge}), so it lives as a `struck` field on that node's nested
 * `Y.Map` in the existing `nodes` fragment ({@link FLOW_NODES_FRAGMENT}) rather
 * than in a fragment of its own. This buys two things for free:
 *
 * - **No orphans.** {@link ./nodes | removeNode} deletes the whole node map, so a
 *   struck node's flag is dropped with it - no cascade cleanup to remember (as
 *   edges need).
 * - **Live rendering for free.** {@link observeNodes} observes the `nodes` map
 *   deeply, so setting/clearing the flag fires the same observer the canvas
 *   already uses for labels and membership - a struck node restyles live.
 *
 * The flag is orthogonal to the content-free {@link FlowNode} membership record:
 * it is a sibling field the node model never reads, so `struck` never appears in
 * a {@link FlowNode} snapshot and the node contract stays unchanged.
 *
 * ## Non-destructive and clearable
 *
 * Strike changes nothing about the argument's text or structure - it is purely a
 * view flag the canvas renders as a readable strike-through. It can be cleared
 * ({@link setNodeStruck} with `false`, or {@link toggleNodeStruck}); only the
 * struck state is stored (an unstruck node stores nothing), so the default is
 * always "not struck". Being a field on the persisted `nodes` map, a strike
 * survives a reload exactly like the node's membership.
 *
 * ## Local-first, never network
 *
 * Helpers mutate Yjs shared types on `handle.doc`, which the document layer
 * persists to IndexedDB - so every strike survives a reload with no network
 * involved, exactly like the node and edge models.
 */
import * as Y from "yjs";

import type { DocumentHandle } from "../documents/core";
import { FLOW_NODES_FRAGMENT } from "./nodes";

/**
 * The field key holding a node's strike flag inside its nested `Y.Map`. A
 * sibling of the node model's own membership fields (`id`/`columnId`/`kind`/
 * `order`); it is written only when `true` (see {@link setNodeStruck}), so an
 * unstruck node carries no such key.
 */
export const STRIKE_FIELD = "struck";

/**
 * Returns the document's top-level `nodes` `Y.Map` - the same map the node model
 * owns, read here via the public fragment constant so strike stays orthogonal to
 * (and never re-implements) the node store.
 */
function nodesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(FLOW_NODES_FRAGMENT);
}

/**
 * Whether the node with `id` is currently struck. `false` when the node has no
 * strike flag *or* when no such node exists (a struck flag is never orphaned, so
 * a missing node is simply unstruck).
 */
export function isNodeStruck(handle: DocumentHandle, id: string): boolean {
  const node = nodesMap(handle.doc).get(id);
  return node ? node.get(STRIKE_FIELD) === true : false;
}

/**
 * Sets or clears the strike flag on the node with `id`. A no-op if no such node
 * exists (never throws - a raced deletion is safe). Clearing *deletes* the field
 * rather than storing `false`, so only the struck state is ever persisted and an
 * unstruck node resolves to the default. Written in one transaction.
 */
export function setNodeStruck(
  handle: DocumentHandle,
  id: string,
  struck: boolean,
): void {
  const node = nodesMap(handle.doc).get(id);
  if (!node) return;
  handle.doc.transact(() => {
    if (struck) node.set(STRIKE_FIELD, true);
    else node.delete(STRIKE_FIELD);
  });
}

/**
 * Flips the strike flag on the node with `id` and returns its new state. The
 * "re-toggle" clear path: striking then re-toggling an argument clears it. A
 * no-op returning `false` if no such node exists.
 */
export function toggleNodeStruck(handle: DocumentHandle, id: string): boolean {
  setNodeStruck(handle, id, !isNodeStruck(handle, id));
  // Re-read so a no-op on a missing node reports its true (unstruck) state
  // rather than the intended flip.
  return isNodeStruck(handle, id);
}
