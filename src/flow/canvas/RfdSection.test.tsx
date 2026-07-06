// jsdom has no IndexedDB; the document core reads the global, so install the
// in-memory fake before anything touches it - the same pattern the editor /
// documents tests use. These tests render the real RFD region over a *real*
// flow-sheet handle (no mocks) and assert on the delineated region + the live
// editable surface. contentEditable is inert under jsdom, so "free typing" is
// exercised through an editor bound to the same `rfd` fragment (the two Tiptap
// editors sync through the shared Y.Doc), proving the region's surface is the
// RFD fragment and edits land in it.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import { FLOW_RFD_FRAGMENT } from "../rfd";
import { RfdSection } from "./RfdSection";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `flow-${Date.now()}-${nextId++}`;

const openFlowSheet = async (): Promise<DocumentHandle> => {
  const handle = openDocument({ id: uniqueId(), kind: "flow-sheet" });
  await handle.whenLoaded;
  return handle;
};

describe("RfdSection", () => {
  it("renders a labelled, delineated Reason For Decision region", () => {
    // Paints synchronously with a null handle (local-first boot); the heading
    // names the region and the section carries the border that separates it from
    // the speech columns above.
    const { getByTestId, getByRole } = render(<RfdSection handle={null} />);
    const section = getByTestId("rfd-section");
    expect(section.tagName).toBe("SECTION");
    expect(section.className).toContain("border-t-2");
    expect(
      getByRole("heading", { name: /reason for decision/i }),
    ).toBeTruthy();
  });

  it("mounts an editable surface once the handle has loaded", async () => {
    const handle = await openFlowSheet();
    const { getByTestId } = render(<RfdSection handle={handle} />);
    await waitFor(() => {
      expect(
        getByTestId("rfd-section").querySelector(
          '[contenteditable="true"].ProseMirror',
        ),
      ).not.toBeNull();
    });
    await handle.close();
  });

  it("shows free-typed RFD text (edits land in the rfd fragment)", async () => {
    const handle = await openFlowSheet();
    const { getByTestId } = render(<RfdSection handle={handle} />);
    await waitFor(() => {
      expect(
        getByTestId("rfd-section").querySelector(".ProseMirror"),
      ).not.toBeNull();
    });

    // Drive text into the RFD fragment the way a debater's keystrokes would; a
    // second editor over the same fragment syncs through the shared Y.Doc, so
    // the rendered region reflects it.
    const editor = createEditor({
      binding: { handle, fragment: FLOW_RFD_FRAGMENT },
      extensions: editorPreset(),
    });
    editor.commands.setContent("<p>Neg wins the disad turn.</p>");

    await waitFor(() => {
      expect(getByTestId("rfd-section").textContent).toContain(
        "Neg wins the disad turn.",
      );
    });

    editor.destroy();
    await handle.close();
  });
});
