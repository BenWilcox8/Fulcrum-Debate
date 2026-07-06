// jsdom has no IndexedDB; install the in-memory fake first (document-layer
// pattern). These tests render Subpoints through the *real* FlowCanvas host over
// a real flow-sheet handle, proving each subpoint renders nested inside its
// contention as a visually distinct (dark, indented) container that hosts its
// own Tiptap text surface, and is labelled by its rank (S1, S2). Assertions are
// structural (rendered presence, class hooks, the editable body), never XYFlow
// measurement, which does not run under jsdom.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn } from "../columns";
import { addContention } from "../contention";
import { addSubpoint } from "../subpoint";
import { FlowCanvas } from "./FlowCanvas";
import { FlowSheetProvider } from "./FlowSheetProvider";
import { CONTENTION_FLOW_NODE_REGISTRY } from "./contention-node-type";

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

const renderCanvas = (handle: DocumentHandle) =>
  render(
    <FlowSheetProvider handle={handle}>
      <FlowCanvas handle={handle} flowNodeTypes={CONTENTION_FLOW_NODE_REGISTRY} />
    </FlowSheetProvider>,
  );

describe("SubpointNode", () => {
  it("renders a subpoint nested inside its contention's body", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);
    const subpoint = addSubpoint(handle, contention.id);

    const { findByTestId } = renderCanvas(handle);

    // The subpoint lives inside the contention's body seam.
    const body = await findByTestId("contention-body");
    const node = await findByTestId("subpoint-node");
    expect(node).toHaveAttribute("data-flow-node-id", subpoint.id);
    expect(body.contains(node)).toBe(true);

    await handle.close();
  });

  it("is visually distinct: a dark, nested container", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);
    addSubpoint(handle, contention.id);

    const { findByTestId } = renderCanvas(handle);

    const node = await findByTestId("subpoint-node");
    // Dark surface (the named dark shell token) with light text so the nesting
    // hierarchy is obvious against the light contention container.
    expect(node.className).toMatch(/bg-shell-text/);
    // Indented (nested) from the contention's left edge.
    expect(node.className).toMatch(/\bpl-/);

    await handle.close();
  });

  it("labels subpoints by their rank within the contention", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    const contention = addContention(handle, col.id);
    addSubpoint(handle, contention.id);
    addSubpoint(handle, contention.id);

    const { findAllByTestId } = renderCanvas(handle);

    const labels = await findAllByTestId("subpoint-label");
    expect(labels.map((l) => l.textContent)).toEqual(["S1", "S2"]);

    await handle.close();
  });

  it("hosts an editable Tiptap surface for the subpoint's text", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);
    addSubpoint(handle, contention.id);

    const { findByTestId } = renderCanvas(handle);

    const node = await findByTestId("subpoint-node");
    await waitFor(() =>
      expect(node.querySelector(".ProseMirror")).not.toBeNull(),
    );
    expect(node.querySelector('[contenteditable="true"]')).not.toBeNull();

    await handle.close();
  });
});
