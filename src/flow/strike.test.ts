// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// These tests drive the **strike** state flag over a *real* flow-sheet handle:
// a debater marks an opponent's argument (a contention) struck - a non-
// destructive view flag that renders as a strike-through, can be cleared, and
// survives a genuine close/reopen round-trip.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import { addColumn } from "./columns";
import { addContention } from "./contention";
import { getNode, removeNode } from "./nodes";
import { isNodeStruck, setNodeStruck, toggleNodeStruck } from "./strike";

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `flow-${Date.now()}-${nextId++}`;

const openFlowSheet = async (id = uniqueId()): Promise<DocumentHandle> => {
  const handle = openDocument({ id, kind: "flow-sheet" });
  await handle.whenLoaded;
  return handle;
};

describe("node strike state", () => {
  it("defaults to unstruck for a freshly added node", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const node = addContention(handle, col.id);

    expect(isNodeStruck(handle, node.id)).toBe(false);

    await handle.close();
  });

  it("sets and clears the strike flag", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    const node = addContention(handle, col.id);

    setNodeStruck(handle, node.id, true);
    expect(isNodeStruck(handle, node.id)).toBe(true);

    setNodeStruck(handle, node.id, false);
    expect(isNodeStruck(handle, node.id)).toBe(false);

    await handle.close();
  });

  it("toggles the strike flag, returning the new state", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const node = addContention(handle, col.id);

    expect(toggleNodeStruck(handle, node.id)).toBe(true);
    expect(isNodeStruck(handle, node.id)).toBe(true);
    // Re-toggling clears it (the documented "can be cleared" path).
    expect(toggleNodeStruck(handle, node.id)).toBe(false);
    expect(isNodeStruck(handle, node.id)).toBe(false);

    await handle.close();
  });

  it("does not disturb the node's membership record", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const node = addContention(handle, col.id);

    setNodeStruck(handle, node.id, true);

    const read = getNode(handle, node.id);
    expect(read?.id).toBe(node.id);
    expect(read?.columnId).toBe(col.id);
    expect(read?.kind).toBe(node.kind);

    await handle.close();
  });

  it("is a no-op for a missing node (never throws)", async () => {
    const handle = await openFlowSheet();

    expect(isNodeStruck(handle, "nope")).toBe(false);
    expect(() => setNodeStruck(handle, "nope", true)).not.toThrow();
    expect(isNodeStruck(handle, "nope")).toBe(false);
    expect(toggleNodeStruck(handle, "nope")).toBe(false);

    await handle.close();
  });

  it("forgets the strike when the node is removed (no orphan flag)", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const node = addContention(handle, col.id);

    setNodeStruck(handle, node.id, true);
    removeNode(handle, node.id);

    expect(isNodeStruck(handle, node.id)).toBe(false);

    await handle.close();
  });
});

describe("strike persistence", () => {
  it("survives a close and reopen", async () => {
    const id = uniqueId();
    let nodeId: string;

    {
      const handle = await openFlowSheet(id);
      const col = addColumn(handle, { side: "neg", label: "1NC" });
      const node = addContention(handle, col.id);
      nodeId = node.id;
      setNodeStruck(handle, node.id, true);
      await handle.close();
    }

    {
      const handle = await openFlowSheet(id);
      expect(isNodeStruck(handle, nodeId)).toBe(true);
      // And it can be cleared on the reloaded document.
      setNodeStruck(handle, nodeId, false);
      expect(isNodeStruck(handle, nodeId)).toBe(false);
      await handle.close();
    }
  });
});
