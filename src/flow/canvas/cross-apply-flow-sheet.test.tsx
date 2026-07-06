// jsdom has no IndexedDB; install the in-memory fake first. XYFlow's pointer
// drag *and* its edge rendering both need real DOM measurement (jsdom measures
// nothing, so no `.react-flow__edge` is ever drawn - the transparent arrow is
// verified in a real browser). This integration test drives what jsdom can
// prove: the *result* of a cross-application through the real editable flow
// sheet - the copied contention renders in the target column, and the arrow edge
// (original -> copy) is recorded in the flow doc by the same `crossApplyContention`
// op the drag fires.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn } from "../columns";
import { addContention } from "../contention";
import { crossApplyContention } from "../cross-apply";
import { listEdges } from "../edges";
import { FlowSheetPanel } from "./FlowSheetPanel";

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

describe("FlowSheetPanel cross-application rendering", () => {
  it("renders the copied contention and a transparent arrow edge for a cross-application", async () => {
    const handle = await openFlowSheet();
    const aff = addColumn(handle, { side: "aff", label: "1AC" });
    const neg = addColumn(handle, { side: "neg", label: "1NC" });
    const original = addContention(handle, aff.id);

    // The exact operation the drag fires: copy the contention into the neg
    // column and record the arrow from original -> copy.
    const copy = crossApplyContention(handle, original.id, neg.id);

    const { findAllByTestId } = render(<FlowSheetPanel handle={handle} />);

    // Both the original and the copy render as contention containers - the copy
    // is now hosted in the neg column.
    await waitFor(async () =>
      expect((await findAllByTestId("contention-node")).length).toBe(2),
    );
    const nodeIds = (await findAllByTestId("contention-node")).map((el) =>
      el.getAttribute("data-flow-node-id"),
    );
    expect(nodeIds).toContain(original.id);
    expect(nodeIds).toContain(copy.id);

    // The arrow edge (rendered as the transparent arrow in a real browser) is
    // recorded in the flow doc, anchored from the original argument to the copy.
    const edges = listEdges(handle);
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeId).toBe(original.id);
    expect(edges[0].targetNodeId).toBe(copy.id);

    await handle.close();
  });
});
