// jsdom has no IndexedDB; the document core reads the global, so install the
// in-memory fake before anything touches it. These tests bind through a real
// document handle (the document-layer test pattern) and assert only on the
// public helpers and the resulting persisted state - never on Yjs internals.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import { addColumn } from "./index";
import {
  addNode,
  getNode,
  listColumnNodes,
  listNodes,
  moveNode,
  observeNodes,
  removeNode,
  type FlowNode,
} from "./index";

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `flow-${Date.now()}-${nextId++}`;

/** Opens a loaded flow-sheet handle over a fresh id. */
const openFlowSheet = async (id = uniqueId()): Promise<DocumentHandle> => {
  const handle = openDocument({ id, kind: "flow-sheet" });
  await handle.whenLoaded;
  return handle;
};

/** Adds a column and returns its id (nodes reference columns by id). */
const addCol = (handle: DocumentHandle, label = "1AC") =>
  addColumn(handle, { side: "aff", label }).id;

/** Node ids of a list, for order-sensitive assertions. */
const ids = (nodes: FlowNode[]) => nodes.map((n) => n.id);

describe("addNode", () => {
  it("adds nodes to a column with stable unique ids and round-trips them", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);

    const a = addNode(handle, { columnId: col, kind: "stub" });
    const b = addNode(handle, { columnId: col, kind: "stub" });

    expect(a.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    expect(a).toEqual({ id: a.id, columnId: col, kind: "stub" });
    expect(getNode(handle, a.id)).toEqual(a);

    await handle.close();
  });

  it("appends each new node to the bottom of its column's vertical order", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);

    const a = addNode(handle, { columnId: col, kind: "stub" });
    const b = addNode(handle, { columnId: col, kind: "stub" });
    const c = addNode(handle, { columnId: col, kind: "stub" });

    expect(ids(listColumnNodes(handle, col))).toEqual([a.id, b.id, c.id]);

    await handle.close();
  });

  it("appends deterministically after a remove leaves gaps in order values", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);

    const a = addNode(handle, { columnId: col, kind: "stub" });
    const b = addNode(handle, { columnId: col, kind: "stub" });
    const c = addNode(handle, { columnId: col, kind: "stub" });

    removeNode(handle, b.id);

    const d = addNode(handle, { columnId: col, kind: "stub" });

    expect(ids(listColumnNodes(handle, col))).toEqual([a.id, c.id, d.id]);

    await handle.close();
  });

  it("returns undefined from getNode for an unknown id", async () => {
    const handle = await openFlowSheet();
    expect(getNode(handle, "nope")).toBeUndefined();
    await handle.close();
  });
});

describe("membership (columnId)", () => {
  it("scopes a column's nodes to that column and preserves each column's order", async () => {
    const handle = await openFlowSheet();
    const left = addCol(handle, "1AC");
    const right = addCol(handle, "1NC");

    const l1 = addNode(handle, { columnId: left, kind: "stub" });
    const r1 = addNode(handle, { columnId: right, kind: "stub" });
    const l2 = addNode(handle, { columnId: left, kind: "stub" });

    expect(ids(listColumnNodes(handle, left))).toEqual([l1.id, l2.id]);
    expect(ids(listColumnNodes(handle, right))).toEqual([r1.id]);
    // Every node carries its membership foreign key.
    expect(getNode(handle, l1.id)?.columnId).toBe(left);
    expect(getNode(handle, r1.id)?.columnId).toBe(right);

    await handle.close();
  });

  it("lists no nodes for a column that has none", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);
    expect(listColumnNodes(handle, col)).toEqual([]);
    await handle.close();
  });
});

describe("moveNode", () => {
  it("reorders a node within its column (forward, backward, clamp)", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);
    const a = addNode(handle, { columnId: col, kind: "stub" });
    const b = addNode(handle, { columnId: col, kind: "stub" });
    const c = addNode(handle, { columnId: col, kind: "stub" });

    // Move the last to the front.
    moveNode(handle, c.id, 0);
    expect(ids(listColumnNodes(handle, col))).toEqual([c.id, a.id, b.id]);

    // Move it back to the end via an out-of-range index (clamped).
    moveNode(handle, c.id, 99);
    expect(ids(listColumnNodes(handle, col))).toEqual([a.id, b.id, c.id]);

    await handle.close();
  });

  it("does not disturb other columns' ordering", async () => {
    const handle = await openFlowSheet();
    const left = addCol(handle, "1AC");
    const right = addCol(handle, "1NC");
    const l1 = addNode(handle, { columnId: left, kind: "stub" });
    const l2 = addNode(handle, { columnId: left, kind: "stub" });
    const r1 = addNode(handle, { columnId: right, kind: "stub" });
    const r2 = addNode(handle, { columnId: right, kind: "stub" });

    moveNode(handle, l2.id, 0);

    expect(ids(listColumnNodes(handle, left))).toEqual([l2.id, l1.id]);
    expect(ids(listColumnNodes(handle, right))).toEqual([r1.id, r2.id]);

    await handle.close();
  });

  it("is a no-op when already at the target index", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);
    const a = addNode(handle, { columnId: col, kind: "stub" });
    const b = addNode(handle, { columnId: col, kind: "stub" });

    moveNode(handle, a.id, 0);
    expect(ids(listColumnNodes(handle, col))).toEqual([a.id, b.id]);

    await handle.close();
  });

  it("throws for an unknown id", async () => {
    const handle = await openFlowSheet();
    expect(() => moveNode(handle, "nope", 0)).toThrow(/no node/);
    await handle.close();
  });
});

describe("removeNode", () => {
  it("removes a node and closes the vertical gap", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);
    const a = addNode(handle, { columnId: col, kind: "stub" });
    const b = addNode(handle, { columnId: col, kind: "stub" });
    const c = addNode(handle, { columnId: col, kind: "stub" });

    removeNode(handle, b.id);

    expect(ids(listColumnNodes(handle, col))).toEqual([a.id, c.id]);
    expect(getNode(handle, b.id)).toBeUndefined();
    // A subsequent move still orders correctly over the closed gap.
    moveNode(handle, c.id, 0);
    expect(ids(listColumnNodes(handle, col))).toEqual([c.id, a.id]);

    await handle.close();
  });

  it("is a no-op for an unknown id", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);
    addNode(handle, { columnId: col, kind: "stub" });
    expect(() => removeNode(handle, "nope")).not.toThrow();
    expect(listColumnNodes(handle, col)).toHaveLength(1);
    await handle.close();
  });
});

describe("listNodes", () => {
  it("returns every node in a stable total order (by column, then vertical)", async () => {
    const handle = await openFlowSheet();
    const left = addCol(handle, "1AC");
    const right = addCol(handle, "1NC");
    const l1 = addNode(handle, { columnId: left, kind: "stub" });
    const r1 = addNode(handle, { columnId: right, kind: "stub" });
    const l2 = addNode(handle, { columnId: left, kind: "stub" });

    // A total order over the whole document, independent of insertion order.
    const all = listNodes(handle);
    expect(all).toHaveLength(3);
    // Grouped by column; within a column, vertical order holds.
    const byCol = new Map<string, string[]>();
    for (const n of all) {
      byCol.set(n.columnId, [...(byCol.get(n.columnId) ?? []), n.id]);
    }
    expect(byCol.get(left)).toEqual([l1.id, l2.id]);
    expect(byCol.get(right)).toEqual([r1.id]);

    await handle.close();
  });
});

describe("observeNodes", () => {
  it("fires immediately and on every add / move / remove, then stops after unsubscribe", async () => {
    const handle = await openFlowSheet();
    const col = addCol(handle);
    const seen: number[] = [];
    const unsubscribe = observeNodes(handle, (nodes) => seen.push(nodes.length));

    // Immediate fire with the current (empty) snapshot.
    expect(seen).toEqual([0]);

    const a = addNode(handle, { columnId: col, kind: "stub" });
    const b = addNode(handle, { columnId: col, kind: "stub" });
    // A reorder (change inside a nested node map) fires too.
    moveNode(handle, b.id, 0);
    removeNode(handle, a.id);

    expect(seen).toEqual([0, 1, 2, 2, 1]);

    unsubscribe();
    addNode(handle, { columnId: col, kind: "stub" });
    expect(seen).toEqual([0, 1, 2, 2, 1]);

    await handle.close();
  });
});

describe("persistence", () => {
  it("survives a reload through a genuinely fresh handle with stable ids and order", async () => {
    const id = uniqueId();
    const handle = await openFlowSheet(id);
    const col = addCol(handle);
    const a = addNode(handle, { columnId: col, kind: "stub" });
    const b = addNode(handle, { columnId: col, kind: "stub" });
    const c = addNode(handle, { columnId: col, kind: "stub" });
    moveNode(handle, c.id, 0);
    removeNode(handle, a.id);
    await handle.close();

    // A brand-new handle + provider over the same backend.
    const reopened = await openFlowSheet(id);
    expect(ids(listColumnNodes(reopened, col))).toEqual([c.id, b.id]);
    expect(getNode(reopened, c.id)).toEqual({
      id: c.id,
      columnId: col,
      kind: "stub",
    });
    await reopened.close();
  });
});
