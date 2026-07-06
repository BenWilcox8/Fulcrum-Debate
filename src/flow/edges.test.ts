// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// These tests drive the cross-application **edge** model over a *real*
// flow-sheet handle: the `addEdge`/`listEdges`/`getEdge`/`removeEdge` helpers
// over the new `edges` fragment, the observe seam, and a genuine close/reopen
// round-trip proving an edge survives reload.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import {
  FLOW_EDGES_FRAGMENT,
  CROSS_APPLICATION_EDGE_KIND,
  addEdge,
  listEdges,
  getEdge,
  removeEdge,
  observeEdges,
} from "./edges";

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

describe("edges fragment", () => {
  it("names a stable top-level fragment distinct from the structural ones", () => {
    expect(FLOW_EDGES_FRAGMENT).toBe("edges");
  });
});

describe("addEdge", () => {
  it("mints an edge from source to target with the default cross-application kind", async () => {
    const handle = await openFlowSheet();

    const edge = addEdge(handle, { sourceNodeId: "a", targetNodeId: "b" });

    expect(edge.id).toBeTruthy();
    expect(edge.sourceNodeId).toBe("a");
    expect(edge.targetNodeId).toBe("b");
    expect(edge.kind).toBe(CROSS_APPLICATION_EDGE_KIND);
    expect(getEdge(handle, edge.id)).toEqual(edge);

    await handle.close();
  });

  it("gives each edge a distinct id", async () => {
    const handle = await openFlowSheet();
    const e1 = addEdge(handle, { sourceNodeId: "a", targetNodeId: "b" });
    const e2 = addEdge(handle, { sourceNodeId: "a", targetNodeId: "c" });
    expect(e1.id).not.toBe(e2.id);
    await handle.close();
  });
});

describe("listEdges", () => {
  it("returns every edge in a stable order", async () => {
    const handle = await openFlowSheet();
    const e1 = addEdge(handle, { sourceNodeId: "a", targetNodeId: "b" });
    const e2 = addEdge(handle, { sourceNodeId: "b", targetNodeId: "c" });

    const ids = listEdges(handle)
      .map((e) => e.id)
      .sort();
    expect(ids).toEqual([e1.id, e2.id].sort());
    // Stable across repeated reads.
    expect(listEdges(handle).map((e) => e.id)).toEqual(
      listEdges(handle).map((e) => e.id),
    );

    await handle.close();
  });

  it("is empty for a fresh flow sheet", async () => {
    const handle = await openFlowSheet();
    expect(listEdges(handle)).toEqual([]);
    await handle.close();
  });
});

describe("removeEdge", () => {
  it("removes the edge and is a no-op for an unknown id", async () => {
    const handle = await openFlowSheet();
    const edge = addEdge(handle, { sourceNodeId: "a", targetNodeId: "b" });

    removeEdge(handle, edge.id);
    expect(getEdge(handle, edge.id)).toBeUndefined();
    expect(listEdges(handle)).toEqual([]);
    // No throw for a missing id.
    expect(() => removeEdge(handle, "nope")).not.toThrow();

    await handle.close();
  });
});

describe("observeEdges", () => {
  it("fires immediately and again on every add/remove", async () => {
    const handle = await openFlowSheet();
    let calls = 0;
    const unobserve = observeEdges(handle, () => {
      calls += 1;
    });
    expect(calls).toBe(1); // immediate

    addEdge(handle, { sourceNodeId: "a", targetNodeId: "b" });
    expect(calls).toBe(2);

    const edge = addEdge(handle, { sourceNodeId: "a", targetNodeId: "c" });
    expect(calls).toBe(3);

    removeEdge(handle, edge.id);
    expect(calls).toBe(4);

    unobserve();
    addEdge(handle, { sourceNodeId: "x", targetNodeId: "y" });
    expect(calls).toBe(4); // no more after unsubscribe

    await handle.close();
  });
});

describe("edge persistence", () => {
  it("survives a close and reopen", async () => {
    const id = uniqueId();
    let edgeId: string;

    {
      const handle = await openFlowSheet(id);
      const edge = addEdge(handle, { sourceNodeId: "src", targetNodeId: "dst" });
      edgeId = edge.id;
      await handle.close();
    }

    {
      const handle = await openFlowSheet(id);
      const edges = listEdges(handle);
      expect(edges).toEqual([
        {
          id: edgeId,
          sourceNodeId: "src",
          targetNodeId: "dst",
          kind: CROSS_APPLICATION_EDGE_KIND,
        },
      ]);
      await handle.close();
    }
  });
});
