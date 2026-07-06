/**
 * The pure flow-edge -> XYFlow-edge mapping for the canvas: the model
 * {@link ../edges | FlowEdge}s become XYFlow `Edge`s the canvas draws, styled as
 * the cross-application PRD's **transparent arrow** - visible but unobtrusive.
 *
 * Kept pure and apart from the `<ReactFlow>` wiring for the same reason the node
 * and column mappings are ({@link ./node-host}, {@link ./column-nodes}): XYFlow's
 * DOM measurement does not run under jsdom, so the translation is testable and
 * the live hook ({@link ./useFlowEdges}) only wires it to the observe seam.
 *
 * An edge anchors from its source node's source handle to its target node's
 * target handle - the small, invisible {@link @xyflow/react!Handle}s the
 * {@link ./ContentionNode} renders so XYFlow has anchors to draw between. The
 * edge is non-interactive: it is a rendered annotation of a cross-application,
 * not an editable connection (the canvas also runs with `nodesConnectable`
 * off).
 */
import { MarkerType, type Edge } from "@xyflow/react";

import type { FlowEdge } from "../edges";

/**
 * Opacity of a cross-application arrow. Low enough to read as unobtrusive
 * ("transparent arrow") while staying clearly visible against the canvas.
 */
export const CROSS_APPLICATION_EDGE_OPACITY = 0.35;

/** Stroke colour of a cross-application arrow (a muted shell token). */
const CROSS_APPLICATION_EDGE_COLOR = "var(--color-shell-muted)";

/**
 * Translates the flow document's edges into XYFlow edges. Pure: given the same
 * edges it returns structurally identical XYFlow edges, with no dependence on the
 * DOM. Each edge is anchored `source -> target` and styled as a low-opacity arrow
 * pointing at the copy; it is non-selectable and non-focusable so it never steals
 * interaction from the nodes it annotates.
 */
export function flowEdgesToEdges(edges: readonly FlowEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    // A gentle curve reads as a cross-reference rather than a hard connection.
    type: "default",
    style: {
      stroke: CROSS_APPLICATION_EDGE_COLOR,
      strokeWidth: 1.5,
      opacity: CROSS_APPLICATION_EDGE_OPACITY,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: CROSS_APPLICATION_EDGE_COLOR,
      width: 16,
      height: 16,
    },
    selectable: false,
    focusable: false,
  }));
}
