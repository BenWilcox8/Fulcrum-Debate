// Pure unit tests for the drag-drop column resolution: given a dragged flow
// node's relative position and the column layout, which column did it land on?
// No DOM, no XYFlow - the interaction glue that calls this is verified in the
// browser; this pins the arithmetic.
import { describe, it, expect } from "vitest";

import { columnAtX, resolveNodeDropColumn, type DropColumn } from "./flow-drag";

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
