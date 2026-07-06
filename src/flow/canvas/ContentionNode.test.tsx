// jsdom has no IndexedDB; install the in-memory fake first (document-layer
// pattern). These tests render the Contention container through the *real*
// FlowCanvas host over a real flow-sheet handle, proving it renders inside its
// column as a large, rounded, side-coloured container that hosts a Tiptap
// argument-text surface. Assertions are structural (rendered presence, class
// hooks, the editable body), never XYFlow measurement, which does not run under
// jsdom.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn } from "../columns";
import { addContention } from "../contention";
import { isNodeStruck, setNodeStruck } from "../strike";
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

describe("ContentionNode", () => {
  it("renders a contention as a large rounded container inside its column", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);

    const { findByTestId } = renderCanvas(handle);

    const node = await findByTestId("contention-node");
    expect(node).toHaveAttribute("data-flow-node-id", contention.id);
    // Large + rounded per the flow's visual language.
    expect(node.className).toMatch(/rounded-xl/);
    // Side-coloured like its column.
    expect(node).toHaveAttribute("data-side", "aff");

    await handle.close();
  });

  it("labels the contention by its rank among contentions in the column", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    addContention(handle, col.id);
    addContention(handle, col.id);

    const { findAllByTestId } = renderCanvas(handle);

    const headers = await findAllByTestId("contention-label");
    expect(headers.map((h) => h.textContent)).toEqual(["C1", "C2"]);

    await handle.close();
  });

  it("renders a struck contention with a non-destructive strike-through", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    const contention = addContention(handle, col.id);
    setNodeStruck(handle, contention.id, true);

    const { findByTestId } = renderCanvas(handle);

    const node = await findByTestId("contention-node");
    // The struck state is a data hook (for CSS + tests) and a readable
    // strike-through, not a removal - the text is still there to read.
    await waitFor(() => expect(node).toHaveAttribute("data-struck", "true"));
    expect(node.className).toMatch(/line-through/);
    // Non-destructive: the label and body are still rendered.
    expect(node.querySelector('[data-testid="contention-label"]')).not.toBeNull();

    await handle.close();
  });

  it("clears the strike via the clear-strike control (re-toggle)", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);
    setNodeStruck(handle, contention.id, true);

    const { findByTestId, queryByTestId } = renderCanvas(handle);

    // The clear control appears only while struck.
    const clear = await findByTestId("contention-clear-strike");
    fireEvent.click(clear);

    await waitFor(() => expect(isNodeStruck(handle, contention.id)).toBe(false));
    // The control disappears once the strike is cleared.
    await waitFor(() =>
      expect(queryByTestId("contention-clear-strike")).toBeNull(),
    );

    await handle.close();
  });

  it("hosts an editable Tiptap argument-text surface", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    addContention(handle, col.id);

    const { findByTestId } = renderCanvas(handle);

    const body = await findByTestId("contention-body");
    // The shared editor mounts a ProseMirror contenteditable into the body.
    await waitFor(() =>
      expect(body.querySelector(".ProseMirror")).not.toBeNull(),
    );
    expect(body.querySelector('[contenteditable="true"]')).not.toBeNull();

    await handle.close();
  });
});
