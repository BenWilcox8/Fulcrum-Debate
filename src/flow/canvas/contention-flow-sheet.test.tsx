// jsdom has no IndexedDB; install the in-memory fake first. This drives the
// whole keyboard-trigger seam through the real editable flow sheet
// (FlowSheetPanel): pick an active column, type the C# trigger, and prove a
// Contention container appears in that column and persists to the flow doc -
// the acceptance path a debater walks while flowing, no dialog.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn, removeColumn } from "../columns";
import { listContentions } from "../contention";
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

const typeTrigger = (keys: string[]) => {
  for (const key of keys) fireEvent.keyDown(document, { key });
};

describe("FlowSheetPanel C# contention trigger", () => {
  it("creates a contention in the active column when C1 is typed", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });

    const { findByTestId } = render(<FlowSheetPanel handle={handle} />);

    // Activate the column (the trigger routes into the active column).
    const column = await findByTestId("speech-column");
    fireEvent.click(column);

    // Type the trigger and commit with Enter - no dialog.
    typeTrigger(["C", "1", "Enter"]);

    await waitFor(() =>
      expect(listContentions(handle, col.id)).toHaveLength(1),
    );
    await findByTestId("contention-node");

    await handle.close();
  });

  it("creates successive contentions (C1, C2) in order", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });

    const { findByTestId } = render(<FlowSheetPanel handle={handle} />);
    fireEvent.click(await findByTestId("speech-column"));

    typeTrigger(["C", "1", "Enter"]);
    await waitFor(() =>
      expect(listContentions(handle, col.id)).toHaveLength(1),
    );
    typeTrigger(["C", "2", "Enter"]);
    await waitFor(() =>
      expect(listContentions(handle, col.id)).toHaveLength(2),
    );

    await handle.close();
  });

  it("does nothing when no column is active", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });

    render(<FlowSheetPanel handle={handle} />);
    // No column clicked: the trigger has nowhere to route.
    typeTrigger(["C", "1", "Enter"]);

    // Give observers a tick; nothing should be created.
    await new Promise((r) => setTimeout(r, 20));
    expect(listContentions(handle, col.id)).toHaveLength(0);

    await handle.close();
  });

  it("creates no node when the active column is removed before the trigger commits", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });

    const { findByTestId } = render(<FlowSheetPanel handle={handle} />);

    // Activate the column.
    const column = await findByTestId("speech-column");
    fireEvent.click(column);

    // Delete the active column before committing the trigger.
    removeColumn(handle, col.id);

    // Give the observer a tick to clear activeColumnId.
    await new Promise((r) => setTimeout(r, 20));

    // Type the trigger: should be a no-op since the column no longer exists.
    typeTrigger(["C", "1", "Enter"]);

    await new Promise((r) => setTimeout(r, 20));
    expect(listContentions(handle, col.id)).toHaveLength(0);

    await handle.close();
  });
});
