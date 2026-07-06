// Pure unit tests for the drag-drop column resolution: given a dragged flow
// node's relative position and the column layout, which column did it land on?
// No DOM, no XYFlow - the interaction glue that calls this is verified in the
// browser; this pins the arithmetic.
import { describe, it, expect } from "vitest";

import {
  columnAtX,
  resolveNodeDropColumn,
  resolveAdjacentNode,
  ADJACENCY_MARGIN,
  type DropColumn,
  type DropTargetNode,
} from "./flow-drag";

// Three columns 300px wide, 20px apart: [0,300) [320,620) [640,940).
const columns: DropColumn[] = [
  { id: "a", x: 0, width: 300 },
  { id: "b", x: 320, width: 300 },
  { id: "c", x: 640, width: 300 },
];

describe("columnAtX", () => {
  it("returns the column whose horizontal span contains x", () => {
    expect(columnAtX(10, columns)).toBe("a");
    expect(columnAtX(299, columns)).toBe("a");
    expect(columnAtX(320, columns)).toBe("b");
    expect(columnAtX(700, columns)).toBe("c");
  });

  it("returns null in the gap between columns or beyond the edges", () => {
    expect(columnAtX(-5, columns)).toBeNull();
    expect(columnAtX(310, columns)).toBeNull(); // in the gap a<->b
    expect(columnAtX(2000, columns)).toBeNull();
  });

  it("returns null for no columns", () => {
    expect(columnAtX(10, [])).toBeNull();
  });
});

describe("resolveNodeDropColumn", () => {
  it("uses the dragged node's center (source column origin + relative x)", () => {
    // Source column "a" (x=0); node dragged so its relative x puts its center
    // deep inside column "b".
    const nodeWidth = 100;
    // center = 0 + relX + 50; to land at 400 (inside b), relX = 350.
    expect(
      resolveNodeDropColumn({
        sourceColumnId: "a",
        nodeRelX: 350,
        nodeWidth,
        columns,
      }),
    ).toBe("b");
  });

  it("resolves back to the source column when barely moved", () => {
    expect(
      resolveNodeDropColumn({
        sourceColumnId: "b",
        nodeRelX: 100,
        nodeWidth: 100,
        columns,
      }),
    ).toBe("b");
  });

  it("returns null when the source column is unknown", () => {
    expect(
      resolveNodeDropColumn({
        sourceColumnId: "missing",
        nodeRelX: 0,
        nodeWidth: 100,
        columns,
      }),
    ).toBeNull();
  });

  it("returns null when the center lands in a gap", () => {
    // Source "a"; center at 310 (gap) -> relX = 310 - 0 - 50 = 260.
    expect(
      resolveNodeDropColumn({
        sourceColumnId: "a",
        nodeRelX: 260,
        nodeWidth: 100,
        columns,
      }),
    ).toBeNull();
  });
});

describe("resolveAdjacentNode", () => {
  // Two stacked target-column nodes, 160px tall, 8px apart:
  // "x" spans [48,208), "y" spans [216,376).
  const targets: DropTargetNode[] = [
    { id: "x", y: 48, height: 160 },
    { id: "y", y: 216, height: 160 },
  ];

  it("returns the node whose vertical slot contains the drop center", () => {
    expect(resolveAdjacentNode(120, targets)).toBe("x");
    expect(resolveAdjacentNode(300, targets)).toBe("y");
    // Exactly on a slot's top edge counts as inside it.
    expect(resolveAdjacentNode(48, targets)).toBe("x");
  });

  it("counts a drop in the immediate gap as adjacent to the nearest node", () => {
    // The 8px gap between the two nodes is within the adjacency margin of both;
    // the nearer one wins. Center at 210 is 2px below x's bottom (208) and 6px
    // above y's top (216) -> nearer to x.
    expect(resolveAdjacentNode(210, targets)).toBe("x");
    // Center at 214 is 6px below x and 2px above y -> nearer to y.
    expect(resolveAdjacentNode(214, targets)).toBe("y");
  });

  it("returns null when the drop is beyond the adjacency margin of every node", () => {
    // Far below both nodes (well past y's bottom + margin).
    expect(resolveAdjacentNode(1000, targets)).toBeNull();
    // Above the first node by more than the margin.
    expect(resolveAdjacentNode(48 - ADJACENCY_MARGIN - 1, targets)).toBeNull();
  });

  it("returns null when the target column has no nodes", () => {
    expect(resolveAdjacentNode(120, [])).toBeNull();
  });

  it("exposes a positive adjacency margin", () => {
    expect(ADJACENCY_MARGIN).toBeGreaterThan(0);
  });
});
