// jsdom has no IndexedDB; install the in-memory fake first. This drives the
// whole S# subpoint-trigger seam through the real editable flow sheet
// (FlowSheetPanel): type the S# trigger *inside a contention's own editor* and
// prove a nested Subpoint container appears under that contention and persists to
// the flow doc - the acceptance path a debater walks while flowing, no dialog.
// Nesting is enforced by construction: the trigger only lives on a contention's
// editor, so a subpoint can only be born inside a contention.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn } from "../columns";
import { addContention } from "../contention";
import { removeNode } from "../nodes";
import { listSubpoints } from "../subpoint";
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

const typeInto = (element: Element, keys: string[]) => {
  for (const key of keys) fireEvent.keyDown(element, { key });
};

describe("FlowSheetPanel S# subpoint trigger", () => {
  it("creates a nested subpoint when S1 is typed inside a contention", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);

    const { findByTestId } = render(<FlowSheetPanel handle={handle} />);

    // Wait for the contention's own editor to mount, then type the trigger into
    // it (S then 1 then Enter) - no dialog, no active-column dance.
    const contentionNode = await findByTestId("contention-node");
    const editor = await waitFor(() => {
      const el = contentionNode.querySelector(".ProseMirror");
      if (!el) throw new Error("editor not mounted");
      return el;
    });

    typeInto(editor, ["S", "1", "Enter"]);

    await waitFor(() =>
      expect(listSubpoints(handle, contention.id)).toHaveLength(1),
    );
    await findByTestId("subpoint-node");

    await handle.close();
  });

  it("creates successive subpoints (S1, S2) in order inside the contention", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    const contention = addContention(handle, col.id);

    const { findByTestId, findAllByTestId } = render(
      <FlowSheetPanel handle={handle} />,
    );
    const contentionNode = await findByTestId("contention-node");
    const editor = await waitFor(() => {
      const el = contentionNode.querySelector(".ProseMirror");
      if (!el) throw new Error("editor not mounted");
      return el;
    });

    typeInto(editor, ["S", "1", "Enter"]);
    await waitFor(() =>
      expect(listSubpoints(handle, contention.id)).toHaveLength(1),
    );
    typeInto(editor, ["S", "2", "Enter"]);
    await waitFor(() =>
      expect(listSubpoints(handle, contention.id)).toHaveLength(2),
    );

    const labels = await findAllByTestId("subpoint-label");
    expect(labels.map((l) => l.textContent)).toEqual(["S1", "S2"]);

    await handle.close();
  });

  it("creates no subpoint when the contention is removed before the trigger commits", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);

    const { findByTestId } = render(<FlowSheetPanel handle={handle} />);
    const contentionNode = await findByTestId("contention-node");
    const editor = await waitFor(() => {
      const el = contentionNode.querySelector(".ProseMirror");
      if (!el) throw new Error("editor not mounted");
      return el;
    });

    // Remove the contention before the trigger commits - simulates the race.
    removeNode(handle, contention.id);

    // Give observers a tick; the ContentionNode may not have unmounted yet.
    await new Promise((r) => setTimeout(r, 20));

    // Type the trigger: should be a no-op because the contention no longer exists.
    typeInto(editor, ["S", "1", "Enter"]);

    await new Promise((r) => setTimeout(r, 20));
    expect(listSubpoints(handle, contention.id)).toHaveLength(0);

    await handle.close();
  });

  it("does not fire on a non-trigger token typed in the contention", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);

    const { findByTestId } = render(<FlowSheetPanel handle={handle} />);
    const contentionNode = await findByTestId("contention-node");
    const editor = await waitFor(() => {
      const el = contentionNode.querySelector(".ProseMirror");
      if (!el) throw new Error("editor not mounted");
      return el;
    });

    // "S" alone committed, and a bare word, must not create a subpoint.
    typeInto(editor, ["S", "Enter"]);
    typeInto(editor, ["h", "i", "Enter"]);

    await new Promise((r) => setTimeout(r, 20));
    expect(listSubpoints(handle, contention.id)).toHaveLength(0);

    await handle.close();
  });
});
