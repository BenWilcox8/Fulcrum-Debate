/**
 * The flow-sheet **collapse view-state** model: what "Collapse All Except Active"
 * means as a pure function, plus the handle read that enumerates the collapsible
 * flow containers it operates over.
 *
 * A debater flowing a full round accumulates many contentions (and nested
 * subpoints) across the speech columns. Collapsing a container to a single
 * horizontal bar - and, in one gesture, collapsing *everything but the one you
 * are working on* - is how the sheet stays legible. This module owns the two pure
 * pieces of that behaviour; the live React state and chrome layer on top of it
 * ({@link ./useFlowCollapse}, {@link ./FlowSheetProvider}, the node components).
 *
 * ## Collapse is transient view-state, by design
 *
 * Collapse/expand is **not** persisted to the flow-sheet document: it is
 * ephemeral UI state held in React (see {@link ./useFlowCollapse}), so reopening
 * a round always starts fully expanded. This is deliberate - a debater's collapse
 * choices are a moment-to-moment reading aid tied to the argument they are on
 * right now, not a property of the case worth surviving a reload (and it keeps
 * this out of the Yjs shared types, so it never syncs or conflicts). If a
 * durable "remember my layout" mode is ever wanted, it becomes a new opt-in on
 * top of this seam, not a change to the default.
 *
 * ## "Active" is well-defined
 *
 * The **active node** is the flow container the debater is currently working in:
 * the one whose header was last clicked or whose text surface was last focused
 * (tracked by {@link ./useFlowCollapse}). "Collapse All Except Active" keeps that
 * node - and, if it is a nested subpoint, the ancestor contention that contains
 * it, so the active node stays visible - expanded, and collapses every other
 * container. With no active node (nothing interacted with yet) it collapses
 * everything.
 */
import type { DocumentHandle } from "../../documents/core";
import { listNodes } from "../nodes";
import { CONTENTION_KIND } from "../contention";
import { listSubpoints } from "../subpoint";

/**
 * The collapsible flow containers of a flow sheet: every contention and every
 * nested subpoint id, plus the subpoint -> parent-contention map. This is the
 * structural input {@link collapseTargets} consumes; a contention has no entry in
 * `parentOf` (it is top-level), a subpoint maps to its contention.
 */
export interface FlowContainerTree {
  /** Every collapsible container id (contentions and subpoints). */
  readonly allIds: string[];
  /** Maps a subpoint id to its parent contention id. */
  readonly parentOf: ReadonlyMap<string, string>;
}

/**
 * Reads the collapsible container tree off a flow-sheet handle: all contentions
 * (from the `nodes` fragment, filtered to {@link CONTENTION_KIND}) and, nested
 * under each, all subpoints (with the contention recorded as their parent). A
 * pure read of current document state - safe to call any time after the handle's
 * local load has resolved.
 */
export function readFlowContainerTree(
  handle: DocumentHandle,
): FlowContainerTree {
  const allIds: string[] = [];
  const parentOf = new Map<string, string>();
  for (const node of listNodes(handle)) {
    if (node.kind !== CONTENTION_KIND) continue;
    allIds.push(node.id);
    for (const subpoint of listSubpoints(handle, node.id)) {
      allIds.push(subpoint.id);
      parentOf.set(subpoint.id, node.id);
    }
  }
  return { allIds, parentOf };
}

/**
 * The set of container ids to collapse for "Collapse All Except Active": every id
 * in `allNodeIds` except the active node and its ancestor chain (so an active
 * subpoint's parent contention stays open and the active node remains visible).
 * A pure function of its inputs - no document, no React.
 *
 * With `activeNodeId === null` (nothing active) it collapses everything. An
 * `activeNodeId` not present in `allNodeIds` is harmless: its (empty) subtree is
 * simply kept, so every real id collapses.
 */
export function collapseTargets(
  allNodeIds: Iterable<string>,
  activeNodeId: string | null,
  parentOf: ReadonlyMap<string, string>,
): Set<string> {
  const keep = new Set<string>();
  let cursor = activeNodeId;
  // Walk the ancestor chain (subpoint -> contention); a contention has no parent.
  while (cursor != null && !keep.has(cursor)) {
    keep.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  const collapsed = new Set<string>();
  for (const id of allNodeIds) {
    if (!keep.has(id)) collapsed.add(id);
  }
  return collapsed;
}
