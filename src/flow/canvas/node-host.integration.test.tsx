// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// These tests drive the node-hosting contract end-to-end over a *real*
// flow-sheet handle with a **stub node kind** registered - proving a later PRD's
// node kind renders inside its column purely by registering it, with no canvas
// edits. Assertions are structural (node objects, parentId, rendered presence),
// never XYFlow measurement or pixels, which do not run under jsdom.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { NodeProps } from "@xyflow/react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, act, renderHook } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn, addNode, moveNode, removeNode } from "../index";
import { FlowCanvas } from "./FlowCanvas";
import { useFlowNodes } from "./useFlowNodes";
import type {
  FlowNodeRegistry,
  HostedFlowNode,
} from "./node-host";

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

// --- The test-only stub node kind ------------------------------------------
//
// The contract ships no real node kinds (contentions/subpoints are their own
// PRDs). This stub is the minimal implementation of a registered kind - a `kind`
// string plus a component that renders its identity - used only to exercise the
// registration/hosting seam end to end.
const STUB_KIND = "stub";

function StubFlowNode({ data }: NodeProps<HostedFlowNode>) {
  return (
    <div
      data-testid="stub-flow-node"
      data-flow-node-id={data.flowNodeId}
      data-column-id={data.columnId}
    >
      {data.kind}
    </div>
  );
}

const STUB_REGISTRY: FlowNodeRegistry = [
  { kind: STUB_KIND, component: StubFlowNode },
];

// --- The live hosting seam (useFlowNodes) ----------------------------------
//
// The pure mapping is covered in node-host.test.ts. This drives the live wiring
// over a real handle: the reliable, measurement-free layer where "a node is
// hosted in a specific column, in order" is asserted behaviourally.
describe("useFlowNodes", () => {
  it("yields an empty list for a null handle", () => {
    const { result } = renderHook(() => useFlowNodes(null, STUB_REGISTRY));
    expect(result.current).toEqual([]);
  });

  it("hosts a registered node inside the column it belongs to", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const n = addNode(handle, { columnId: col.id, kind: STUB_KIND });

    const { result } = renderHook(() => useFlowNodes(handle, STUB_REGISTRY));

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].id).toBe(n.id);
    // Membership is authoritative in the flow doc -> becomes the XYFlow parent.
    expect(result.current[0].parentId).toBe(col.id);
    expect(result.current[0].data.columnId).toBe(col.id);

    await handle.close();
  });

  it("reflects add, reorder, and remove of nodes live, per column", async () => {
    const handle = await openFlowSheet();
    const left = addColumn(handle, { side: "aff", label: "1AC" });
    const right = addColumn(handle, { side: "neg", label: "1NC" });

    const { result } = renderHook(() => useFlowNodes(handle, STUB_REGISTRY));

    let a!: { id: string };
    let b!: { id: string };
    let r!: { id: string };
    act(() => {
      a = addNode(handle, { columnId: left.id, kind: STUB_KIND });
      b = addNode(handle, { columnId: left.id, kind: STUB_KIND });
      r = addNode(handle, { columnId: right.id, kind: STUB_KIND });
    });
    await waitFor(() => expect(result.current).toHaveLength(3));

    const inLeft = () =>
      result.current.filter((n) => n.parentId === left.id).map((n) => n.id);
    expect(inLeft()).toEqual([a.id, b.id]);

    // Reorder within the left column.
    act(() => moveNode(handle, b.id, 0));
    await waitFor(() => expect(inLeft()).toEqual([b.id, a.id]));

    // Remove one; the right column is untouched.
    act(() => removeNode(handle, a.id));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(inLeft()).toEqual([b.id]);
    expect(result.current.some((n) => n.id === r.id)).toBe(true);

    await handle.close();
  });

  it("does not host a node whose kind is not registered", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    addNode(handle, { columnId: col.id, kind: "unregistered" });

    const { result } = renderHook(() => useFlowNodes(handle, STUB_REGISTRY));
    // Give observers a tick; nothing should ever appear.
    await waitFor(() => expect(result.current).toEqual([]));

    await handle.close();
  });
});

// --- The rendered canvas hosting the stub kind -----------------------------
describe("FlowCanvas hosting a registered node kind", () => {
  it("renders a registered node inside its column", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const n = addNode(handle, { columnId: col.id, kind: STUB_KIND });

    const { findByTestId } = render(
      <FlowCanvas handle={handle} flowNodeTypes={STUB_REGISTRY} />,
    );

    const stub = await findByTestId("stub-flow-node");
    // The rendered node carries its flow-doc identity and column membership.
    expect(stub).toHaveAttribute("data-flow-node-id", n.id);
    expect(stub).toHaveAttribute("data-column-id", col.id);
    // Its column still renders alongside it.
    expect(await findByTestId("speech-column")).toBeInTheDocument();

    await handle.close();
  });

  it("renders columns only when no node kinds are registered", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    addNode(handle, { columnId: col.id, kind: STUB_KIND });

    const { findAllByTestId, queryByTestId } = render(
      <FlowCanvas handle={handle} />,
    );

    // The column paints; the unregistered stub node does not.
    await findAllByTestId("speech-column");
    expect(queryByTestId("stub-flow-node")).toBeNull();

    await handle.close();
  });
});
