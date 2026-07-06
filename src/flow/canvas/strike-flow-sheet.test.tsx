// jsdom has no IndexedDB; install the in-memory fake first. XYFlow's pointer
// drag needs real DOM measurement (jsdom measures nothing), so the actual
// drag->strike gesture is verified in a real browser. This integration test
// drives what jsdom can prove: the *result* of the clash workflow through the
// real editable flow sheet - dropping an argument adjacent to an opponent's
// argument both cross-applies (a copy + arrow) AND strikes that opponent
// argument, and the panel renders the opponent struck while the copy appears.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn } from "../columns";
import { addContention } from "../contention";
import { crossApplyContention } from "../cross-apply";
import { setNodeStruck } from "../strike";
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

const strikeNodeEl = (
  root: HTMLElement,
  nodeId: string,
): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-flow-node-id="${nodeId}"]`);

describe("FlowSheetPanel strike-on-drop rendering", () => {
  it("renders the opponent argument struck and the cross-applied copy after an adjacent drop", async () => {
    const handle = await openFlowSheet();
    const aff = addColumn(handle, { side: "aff", label: "1AC" });
    const neg = addColumn(handle, { side: "neg", label: "1NC" });
    const mine = addContention(handle, aff.id);
    const opponent = addContention(handle, neg.id);

    // The exact effects an adjacent drop fires: cross-apply my argument into the
    // neg column (copy + arrow) and strike the opponent argument it landed next
    // to. See FlowCanvas/FlowSheetPanel for the geometry that resolves both.
    const copy = crossApplyContention(handle, mine.id, neg.id);
    setNodeStruck(handle, opponent.id, true);

    const { container } = render(<FlowSheetPanel handle={handle} />);

    // The opponent argument is struck (non-destructively).
    await waitFor(() =>
      expect(strikeNodeEl(container, opponent.id)).toHaveAttribute(
        "data-struck",
        "true",
      ),
    );
    // The cross-applied copy is present and NOT struck (only the opponent is).
    const copyEl = strikeNodeEl(container, copy.id);
    expect(copyEl).not.toBeNull();
    expect(copyEl).not.toHaveAttribute("data-struck");
    // My original argument stays unstruck too.
    expect(strikeNodeEl(container, mine.id)).not.toHaveAttribute("data-struck");

    // The cross-application arrow is recorded (original -> copy).
    const edges = listEdges(handle);
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeId).toBe(mine.id);
    expect(edges[0].targetNodeId).toBe(copy.id);

    await handle.close();
  });
});
