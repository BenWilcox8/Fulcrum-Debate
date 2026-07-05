import { describe, it, expect } from "vitest";

import type { SpeechColumn } from "../columns";
import {
  columnsToNodes,
  columnX,
  columnsContentWidth,
  COLUMN_WIDTH,
  COLUMN_GAP,
  DEFAULT_COLUMN_HEIGHT,
  SPEECH_COLUMN_NODE_TYPE,
} from "./column-nodes";

const col = (id: string, label: string, side: SpeechColumn["side"]): SpeechColumn => ({
  id,
  label,
  side,
});

describe("columnsToNodes", () => {
  it("maps columns to nodes in document order, one per column", () => {
    const nodes = columnsToNodes([
      col("a", "1AC", "aff"),
      col("b", "1NC", "neg"),
      col("c", "2AC", "aff"),
    ]);

    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(nodes.map((n) => n.data.label)).toEqual(["1AC", "1NC", "2AC"]);
    expect(nodes.map((n) => n.data.side)).toEqual(["aff", "neg", "aff"]);
    expect(nodes.every((n) => n.type === SPEECH_COLUMN_NODE_TYPE)).toBe(true);
  });

  it("preserves the column id as the node id (the flow-node foreign key)", () => {
    const [node] = columnsToNodes([col("stable-id", "1AC", "aff")]);
    expect(node.id).toBe("stable-id");
  });

  it("lays columns out left-to-right, evenly spaced by width + gap", () => {
    const nodes = columnsToNodes([
      col("a", "1AC", "aff"),
      col("b", "1NC", "neg"),
      col("c", "2AC", "aff"),
    ]);

    expect(nodes.map((n) => n.position.x)).toEqual([
      0,
      COLUMN_WIDTH + COLUMN_GAP,
      2 * (COLUMN_WIDTH + COLUMN_GAP),
    ]);
    // Full-height columns share a top edge.
    expect(nodes.every((n) => n.position.y === 0)).toBe(true);
    expect(nodes.every((n) => n.width === COLUMN_WIDTH)).toBe(true);
  });

  it("defaults column height and honours an explicit one", () => {
    const [dflt] = columnsToNodes([col("a", "1AC", "aff")]);
    expect(dflt.height).toBe(DEFAULT_COLUMN_HEIGHT);

    const [sized] = columnsToNodes([col("a", "1AC", "aff")], { height: 900 });
    expect(sized.height).toBe(900);
  });

  it("marks nodes render-only (no drag, no selection)", () => {
    const [node] = columnsToNodes([col("a", "1AC", "aff")]);
    expect(node.draggable).toBe(false);
    expect(node.selectable).toBe(false);
  });

  it("returns no nodes for no columns", () => {
    expect(columnsToNodes([])).toEqual([]);
  });
});

describe("columnX / columnsContentWidth", () => {
  it("columnX is the pure per-index origin", () => {
    expect(columnX(0)).toBe(0);
    expect(columnX(4)).toBe(4 * (COLUMN_WIDTH + COLUMN_GAP));
  });

  it("content width grows past any fixed viewport as columns accumulate", () => {
    // A representative viewport narrower than a few columns: the canvas must be
    // horizontally pannable exactly because content width exceeds it.
    const viewport = COLUMN_WIDTH * 2;
    expect(columnsContentWidth(0)).toBe(0);
    expect(columnsContentWidth(1)).toBe(COLUMN_WIDTH);
    expect(columnsContentWidth(6)).toBeGreaterThan(viewport);
    // Monotonically increasing in the number of columns.
    expect(columnsContentWidth(7)).toBeGreaterThan(columnsContentWidth(6));
  });
});
