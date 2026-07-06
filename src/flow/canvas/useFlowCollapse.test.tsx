// jsdom has no IndexedDB; install the in-memory fake first (document-layer
// pattern). These tests drive the transient collapse view-state hook over a
// *real* flow-sheet handle: toggling a node's collapse, tracking the active
// node, and the "Collapse All Except Active" operation that reads the live
// container tree off the handle.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn } from "../columns";
import { addContention } from "../contention";
import { addSubpoint } from "../subpoint";
import { useFlowCollapse } from "./useFlowCollapse";

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

describe("useFlowCollapse", () => {
  it("starts with nothing collapsed and no active node", async () => {
    const handle = await openFlowSheet();
    const { result } = renderHook(() => useFlowCollapse(handle));

    expect(result.current.collapsedNodeIds.size).toBe(0);
    expect(result.current.activeNodeId).toBeNull();
    expect(result.current.isCollapsed("anything")).toBe(false);

    await handle.close();
  });

  it("toggles and sets a single node's collapse state", async () => {
    const handle = await openFlowSheet();
    const { result } = renderHook(() => useFlowCollapse(handle));

    act(() => result.current.toggleCollapsed("n1"));
    expect(result.current.isCollapsed("n1")).toBe(true);

    act(() => result.current.toggleCollapsed("n1"));
    expect(result.current.isCollapsed("n1")).toBe(false);

    act(() => result.current.setCollapsed("n1", true));
    expect(result.current.isCollapsed("n1")).toBe(true);
    act(() => result.current.setCollapsed("n1", false));
    expect(result.current.isCollapsed("n1")).toBe(false);

    await handle.close();
  });

  it("tracks the active node", async () => {
    const handle = await openFlowSheet();
    const { result } = renderHook(() => useFlowCollapse(handle));

    act(() => result.current.setActiveNodeId("n2"));
    expect(result.current.activeNodeId).toBe("n2");
    act(() => result.current.setActiveNodeId(null));
    expect(result.current.activeNodeId).toBeNull();

    await handle.close();
  });

  it("collapses all containers except the active one", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);

    const { result } = renderHook(() => useFlowCollapse(handle));

    act(() => result.current.setActiveNodeId(c1.id));
    act(() => result.current.collapseAllExceptActive());

    expect(result.current.isCollapsed(c1.id)).toBe(false);
    expect(result.current.isCollapsed(c2.id)).toBe(true);

    await handle.close();
  });

  it("keeps an active subpoint and its parent contention expanded", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);
    const s1 = addSubpoint(handle, c1.id);
    const s2 = addSubpoint(handle, c1.id);

    const { result } = renderHook(() => useFlowCollapse(handle));

    act(() => result.current.setActiveNodeId(s1.id));
    act(() => result.current.collapseAllExceptActive());

    // Active subpoint + its parent stay open; the rest collapse.
    expect(result.current.isCollapsed(s1.id)).toBe(false);
    expect(result.current.isCollapsed(c1.id)).toBe(false);
    expect(result.current.isCollapsed(c2.id)).toBe(true);
    expect(result.current.isCollapsed(s2.id)).toBe(true);

    await handle.close();
  });

  it("collapses everything when there is no active node", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);

    const { result } = renderHook(() => useFlowCollapse(handle));

    act(() => result.current.collapseAllExceptActive());

    expect(result.current.isCollapsed(c1.id)).toBe(true);
    expect(result.current.isCollapsed(c2.id)).toBe(true);

    await handle.close();
  });
});
