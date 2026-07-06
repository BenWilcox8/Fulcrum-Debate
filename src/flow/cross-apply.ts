/**
 * The **cross-application** operation: copy an argument (a contention) into
 * another column and draw a transparent arrow from the original to the copy.
 *
 * This is the debate move the drag/strike PRD is built around - "cross-applying"
 * an argument made in one speech to another. A debater drags a contention onto a
 * different column and a *copy* lands there while the original stays put, with an
 * arrow linking the two. This module is the pure data operation behind that
 * gesture (Yjs + the flow models only, no React, no canvas); the XYFlow drag
 * wiring that invokes it lives in {@link ./canvas}.
 *
 * ## What a copy is (a true, independent copy)
 *
 * The copy is a brand-new contention {@link FlowNode} in the target column, with
 * its own freshly minted id, and its content is a **deep clone** of the source's
 * argument-row structure - so the copy's addressable arguments and grouped
 * responses ({@link ./argument-rows | locateArgumentRows}) match the original at
 * copy time but then diverge: editing one never touches the other. Because a
 * contention's text lives in its own id-derived fragment
 * ({@link contentionContentFragment}), copying is "mint a new id, clone the old
 * fragment into the new one" - the container contract makes this explicit.
 *
 * Nested {@link ./subpoint | subpoints} come across too: each source subpoint is
 * re-created under the copy (a fresh id, preserving order) with its own text
 * fragment deep-cloned, so the copy is a faithful whole-container copy that
 * reloads intact.
 *
 * ## The arrow
 *
 * A {@link ./edges | FlowEdge} of kind {@link CROSS_APPLICATION_EDGE_KIND} is
 * recorded from the original to the copy. It persists in the flow document and
 * the canvas renders it as the transparent arrow.
 *
 * ## Atomicity
 *
 * The whole operation - new node, cloned content, cloned subpoints, and the edge
 * - runs inside one `doc.transact`, so observers never see a partial copy and it
 * is a single undo step.
 */
import * as Y from "yjs";

import type { DocumentHandle } from "../documents/core";
import {
  CONTENTION_KIND,
  addContention,
  contentionContentFragment,
} from "./contention";
import { getNode, type FlowNode } from "./nodes";
import {
  addSubpoint,
  listSubpoints,
  subpointContentFragment,
} from "./subpoint";
import { addEdge } from "./edges";

/**
 * Deep-clones every top-level child of the `srcName` XML fragment into the
 * `dstName` fragment on the same doc. Yjs `clone()` produces an unintegrated
 * deep copy, so the destination content is fully independent of the source once
 * integrated - editing one never affects the other. The destination is assumed
 * empty (a freshly minted node's fragment); nothing is deleted first.
 */
function copyContentFragment(
  doc: Y.Doc,
  srcName: string,
  dstName: string,
): void {
  const src = doc.getXmlFragment(srcName);
  if (src.length === 0) return;
  const dst = doc.getXmlFragment(dstName);
  // `clone()` produces an unintegrated deep copy of each top-level child. A flow-
  // node fragment only ever holds elements/text (never hooks), so this narrows
  // safely to the fragment's insert signature.
  const clones = src
    .toArray()
    .map((item) => item.clone()) as (Y.XmlElement | Y.XmlText)[];
  dst.insert(0, clones);
}

/**
 * Copies the contention `nodeId` into `targetColumnId` and records a
 * cross-application arrow edge from the original to the copy. Returns the copy's
 * {@link FlowNode}.
 *
 * The copy is a new contention in the target column whose argument-row content
 * and nested subpoints are deep clones of the original's, so the original is
 * left completely unchanged. The whole operation is one transaction.
 *
 * @throws if `nodeId` does not resolve to a live {@link CONTENTION_KIND} node -
 * only a contention can be cross-applied (the argument unit the drag moves).
 */
export function crossApplyContention(
  handle: DocumentHandle,
  nodeId: string,
  targetColumnId: string,
): FlowNode {
  const source = getNode(handle, nodeId);
  if (!source || source.kind !== CONTENTION_KIND) {
    throw new Error(
      `crossApplyContention: no contention with id "${nodeId}" - only a contention can be cross-applied`,
    );
  }

  let copy: FlowNode | undefined;
  handle.doc.transact(() => {
    copy = addContention(handle, targetColumnId);

    // Deep-clone the argument-row content into the copy's own fragment.
    copyContentFragment(
      handle.doc,
      contentionContentFragment(source.id),
      contentionContentFragment(copy.id),
    );

    // Re-create each nested subpoint under the copy, in order, cloning its text.
    for (const subpoint of listSubpoints(handle, source.id)) {
      const copiedSubpoint = addSubpoint(handle, copy.id);
      copyContentFragment(
        handle.doc,
        subpointContentFragment(subpoint.id),
        subpointContentFragment(copiedSubpoint.id),
      );
    }

    // The transparent arrow linking the original to the copy.
    addEdge(handle, { sourceNodeId: source.id, targetNodeId: copy.id });
  });

  // `copy` is always assigned inside the synchronous transaction above.
  return copy as FlowNode;
}
