// Pure unit tests for the flow-edge -> XYFlow-edge mapping: the model edges
// become XYFlow edges anchored source->target and styled as the PRD's
// "transparent arrow" (low opacity, arrow marker). No DOM here; the rendering is
// verified in the browser.
import { describe, it, expect } from "vitest";
import { MarkerType } from "@xyflow/react";

import type { FlowEdge } from "../edges";
import { CROSS_APPLICATION_EDGE_KIND } from "../edges";
import { flowEdgesToEdges, CROSS_APPLICATION_EDGE_OPACITY } from "./flow-edge";

const edge = (id: string, source: string, target: string): FlowEdge => ({
  id,
  sourceNodeId: source,
  targetNodeId: target,
  kind: CROSS_APPLICATION_EDGE_KIND,
});

describe("flowEdgesToEdges", () => {
  it("anchors each edge from its source node to its target node", () => {
    const [e] = flowEdgesToEdges([edge("e1", "a", "b")]);
    expect(e.id).toBe("e1");
    expect(e.source).toBe("a");
    expect(e.target).toBe("b");
  });

  it("styles the edge as a legible-but-lighter arrow (opacity + arrow marker)", () => {
    const [e] = flowEdgesToEdges([edge("e1", "a", "b")]);
    // Lighter than primary content, but legible: the clash link is the point of
    // the visual, so it must read clearly rather than sit near-invisible.
    expect(e.style?.opacity).toBe(CROSS_APPLICATION_EDGE_OPACITY);
    expect(CROSS_APPLICATION_EDGE_OPACITY).toBeGreaterThanOrEqual(0.5);
    expect(CROSS_APPLICATION_EDGE_OPACITY).toBeLessThan(1);
    // A clear arrowhead points at the copy so the direction of the link reads.
    expect(e.markerEnd).toMatchObject({ type: MarkerType.ArrowClosed });
    const marker = e.markerEnd as { width?: number; height?: number };
    expect(marker.width).toBeGreaterThanOrEqual(20);
    expect(marker.height).toBeGreaterThanOrEqual(20);
  });

  it("is not interactive (a rendered annotation, not an editable connection)", () => {
    const [e] = flowEdgesToEdges([edge("e1", "a", "b")]);
    expect(e.selectable).toBe(false);
    expect(e.focusable).toBe(false);
  });

  it("maps every edge and preserves count", () => {
    const edges = flowEdgesToEdges([
      edge("e1", "a", "b"),
      edge("e2", "b", "c"),
    ]);
    expect(edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("returns an empty list for no edges", () => {
    expect(flowEdgesToEdges([])).toEqual([]);
  });
});
