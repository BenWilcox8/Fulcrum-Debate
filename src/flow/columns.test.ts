// jsdom has no IndexedDB; the document core reads the global, so install the
// in-memory fake before anything touches it. These tests bind through a real
// document handle (matching the document-layer test pattern) and assert only on
// the public helpers and the resulting persisted state - never on Yjs internals.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import {
  addColumn,
  getColumn,
  listColumns,
  moveColumn,
  observeColumns,
  relabelColumn,
  removeColumn,
  isFlowSide,
  type SpeechColumn,
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

/** The (id, label, side) tuples of a column list, for order-sensitive asserts. */
const shape = (columns: SpeechColumn[]) =>
  columns.map((c) => ({ label: c.label, side: c.side }));

describe("addColumn", () => {
  it("appends columns in insertion order, each with a stable unique id", async () => {
    const handle = await openFlowSheet();

    const first = addColumn(handle, { side: "aff", label: "1AC" });
    const second = addColumn(handle, { side: "neg", label: "1NC" });

    expect(first.id).toBeTruthy();
    expect(second.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
    expect(listColumns(handle)).toEqual([first, second]);

    await handle.close();
  });

  it("returns a column whose fields round-trip through getColumn", async () => {
    const handle = await openFlowSheet();

    const col = addColumn(handle, { side: "neg", label: "2NR" });
    expect(getColumn(handle, col.id)).toEqual(col);
    expect(getColumn(handle, "missing")).toBeUndefined();

    await handle.close();
  });
});

describe("relabelColumn", () => {
  it("changes the label while preserving id, side, and position", async () => {
    const handle = await openFlowSheet();
    addColumn(handle, { side: "aff", label: "1AC" });
    const target = addColumn(handle, { side: "neg", label: "typo" });
    addColumn(handle, { side: "aff", label: "2AC" });

    const updated = relabelColumn(handle, target.id, "1NC");

    expect(updated).toEqual({ id: target.id, label: "1NC", side: "neg" });
    expect(shape(listColumns(handle))).toEqual([
      { label: "1AC", side: "aff" },
      { label: "1NC", side: "neg" },
      { label: "2AC", side: "aff" },
    ]);

    await handle.close();
  });

  it("throws for an unknown id", async () => {
    const handle = await openFlowSheet();
    expect(() => relabelColumn(handle, "nope", "x")).toThrow();
    await handle.close();
  });
});

describe("moveColumn", () => {
  const seed = (handle: DocumentHandle) => ({
    a: addColumn(handle, { side: "aff", label: "A" }),
    b: addColumn(handle, { side: "neg", label: "B" }),
    c: addColumn(handle, { side: "aff", label: "C" }),
    d: addColumn(handle, { side: "neg", label: "D" }),
  });

  it("moves a column forward to a later index", async () => {
    const handle = await openFlowSheet();
    const { a } = seed(handle);

    moveColumn(handle, a.id, 2); // A,B,C,D -> B,C,A,D

    expect(listColumns(handle).map((c) => c.label)).toEqual(["B", "C", "A", "D"]);
    await handle.close();
  });

  it("moves a column backward to an earlier index", async () => {
    const handle = await openFlowSheet();
    const { d } = seed(handle);

    moveColumn(handle, d.id, 1); // A,B,C,D -> A,D,B,C

    expect(listColumns(handle).map((c) => c.label)).toEqual(["A", "D", "B", "C"]);
    await handle.close();
  });

  it("clamps an out-of-range target to the ends of the list", async () => {
    const handle = await openFlowSheet();
    const { a, d } = seed(handle);

    moveColumn(handle, a.id, 99); // clamps to last
    expect(listColumns(handle).map((c) => c.label)).toEqual(["B", "C", "D", "A"]);

    moveColumn(handle, d.id, -5); // clamps to first
    expect(listColumns(handle).map((c) => c.label)).toEqual(["D", "B", "C", "A"]);
    await handle.close();
  });

  it("preserves the moved column's id and fields", async () => {
    const handle = await openFlowSheet();
    const { b } = seed(handle);

    moveColumn(handle, b.id, 0);

    expect(getColumn(handle, b.id)).toEqual(b);
    await handle.close();
  });

  it("throws for an unknown id", async () => {
    const handle = await openFlowSheet();
    seed(handle);
    expect(() => moveColumn(handle, "nope", 0)).toThrow();
    await handle.close();
  });
});

describe("removeColumn", () => {
  it("removes only the named column", async () => {
    const handle = await openFlowSheet();
    const a = addColumn(handle, { side: "aff", label: "A" });
    const b = addColumn(handle, { side: "neg", label: "B" });
    const c = addColumn(handle, { side: "aff", label: "C" });

    removeColumn(handle, b.id);

    expect(listColumns(handle)).toEqual([a, c]);
    expect(getColumn(handle, b.id)).toBeUndefined();
    await handle.close();
  });

  it("is a no-op for an unknown id", async () => {
    const handle = await openFlowSheet();
    const a = addColumn(handle, { side: "aff", label: "A" });
    expect(() => removeColumn(handle, "nope")).not.toThrow();
    expect(listColumns(handle)).toEqual([a]);
    await handle.close();
  });
});

describe("persistence", () => {
  it("column list survives a reload through a genuinely fresh handle", async () => {
    const id = uniqueId();
    const handle = await openFlowSheet(id);

    const a = addColumn(handle, { side: "aff", label: "1AC" });
    const b = addColumn(handle, { side: "neg", label: "1NC" });
    const c = addColumn(handle, { side: "aff", label: "2AC" });
    relabelColumn(handle, b.id, "1NC*");
    moveColumn(handle, c.id, 0);
    removeColumn(handle, a.id);
    await handle.close();

    // A brand-new handle over the same store must restore the exact state.
    const reopened = await openFlowSheet(id);
    expect(shape(listColumns(reopened))).toEqual([
      { label: "2AC", side: "aff" },
      { label: "1NC*", side: "neg" },
    ]);
    // Ids are stable across reload - later flow nodes rely on this.
    expect(listColumns(reopened).map((col) => col.id)).toEqual([c.id, b.id]);
    await reopened.close();
  });
});

describe("observeColumns", () => {
  it("fires immediately then on add, relabel, reorder, and remove", async () => {
    const handle = await openFlowSheet();
    const snapshots: SpeechColumn[][] = [];
    const unsubscribe = observeColumns(handle, (cols) => snapshots.push(cols));

    // Immediate fire with the empty list.
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual([]);

    const a = addColumn(handle, { side: "aff", label: "A" });
    const b = addColumn(handle, { side: "neg", label: "B" });
    relabelColumn(handle, a.id, "A*");
    moveColumn(handle, a.id, 1);
    removeColumn(handle, b.id);

    // One fire per mutation (plus the immediate one).
    expect(snapshots).toHaveLength(6);
    expect(shape(snapshots.at(-1)!)).toEqual([{ label: "A*", side: "aff" }]);

    unsubscribe();
    addColumn(handle, { side: "neg", label: "ignored" });
    expect(snapshots).toHaveLength(6);

    await handle.close();
  });
});

describe("isFlowSide", () => {
  it("guards the two valid sides", () => {
    expect(isFlowSide("aff")).toBe(true);
    expect(isFlowSide("neg")).toBe(true);
    expect(isFlowSide("center")).toBe(false);
    expect(isFlowSide(undefined)).toBe(false);
  });
});
