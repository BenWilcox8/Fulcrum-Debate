// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern every document / flow / round test uses.
//
// This is the whole-stack closeout for the **Contention & Subpoint Nodes** PRD
// (slice 3/3). It drives the *real* keyboard-first flow the way a debater walks
// it, top to bottom, with no mocks: a round is a flow-sheet document created
// through the document service (`useRounds`); the editable flow sheet
// (`FlowSheetPanel`) hosts the XYFlow canvas, the C# contention trigger, and each
// contention's own S# subpoint trigger; a real Tiptap surface carries the
// argument text. It composes the two containers the earlier slices unit-tested in
// isolation (`contention-flow-sheet` for C#, `subpoint-flow-sheet` for S#) and
// then proves the *whole* structure survives a fresh-instance reload.
//
// The shape is: author a round on one service instance (activate a column, type
// `C1` to drop a contention, type `S1` inside it to nest a subpoint, then build
// the structure out quickly by keyboard - a second contention and a second
// subpoint), type argument text into a contention and a subpoint through real
// editors bound to their per-node fragments, throw the whole instance away, then
// reopen the same IndexedDB backend through a *completely fresh* service (the
// restart) and assert everything is restored - contentions in order, subpoints
// nested under their contention in order, and both argument texts - both at the
// model level and rendered through the real panel. Assertions stay behavioural
// (model snapshots, rendered presence, fragment text), never Yjs internals.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { Editor } from "@tiptap/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  render,
  waitFor,
  act,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";

import { DocumentsProvider, useDocumentService } from "../documents/react";
import { useRounds } from "../rounds";
import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { addColumn, listColumns } from "./index";
import { contentionContentFragment, listContentions } from "./contention";
import { subpointContentFragment, listSubpoints } from "./subpoint";
import { FlowSheetPanel } from "./canvas";

// A fresh IndexedDB backend per test so nothing leaks between tests. The two
// service instances in each test share this one backend - that shared backend
// *is* the persistence under test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/**
 * A headless harness exposing the live service and the round seam, so the test
 * can create a round exactly the way the shell screens do (through `useRounds`)
 * and then reach the same service to open the round's handle for flow edits.
 */
interface Harness {
  service: DocumentService;
  createRound: (title?: string) => Promise<string>;
}

let harness: Harness | null = null;

function CaptureHarness() {
  const service = useDocumentService();
  const { createRound } = useRounds();
  harness = { service, createRound };
  return null;
}

async function withHarness(run: (h: Harness) => Promise<void>) {
  harness = null;
  const view = render(
    <DocumentsProvider>
      <CaptureHarness />
    </DocumentsProvider>,
  );
  await waitFor(() => expect(harness).not.toBeNull());
  await run(harness!);
  view.unmount();
  await waitFor(() => expect(harness!.service.closed).toBe(true));
}

/** Fire a keyboard trigger token (e.g. `C`, `1`, `Enter`) at a target. */
const typeTrigger = (target: Element | Document, keys: string[]) => {
  for (const key of keys) fireEvent.keyDown(target, { key });
};

/**
 * The `.ProseMirror` surface a mounted contention hosts. Under the panel a
 * contention's argument editor is where the S# trigger listens, so the subpoint
 * gesture must be typed *into* this element (the opposite of the document-wide C#
 * trigger).
 */
const contentionEditorOf = (node: HTMLElement) =>
  waitFor(() => {
    const el = node.querySelector<HTMLElement>(".ProseMirror");
    if (!el) throw new Error("contention editor not mounted");
    return el;
  });

/**
 * Type argument text into a per-node fragment through a real Tiptap surface - the
 * same shared preset a contention/subpoint editor binds to. Used after the
 * structure is built (and the panel unmounted) so a single editor owns the
 * fragment while it is written: jsdom cannot type real text through a rendered
 * ProseMirror view, so the faithful "text via Tiptap" is a genuine editor over
 * the same fragment the panel binds to.
 */
function writeFragmentText(
  handle: DocumentHandle,
  fragment: string,
  text: string,
): void {
  const editor: Editor = createEditor({
    binding: { handle, fragment },
    extensions: editorPreset(),
  });
  try {
    editor.commands.insertContent(text);
  } finally {
    editor.destroy();
  }
}

describe("contention + subpoint end-to-end", () => {
  it("builds contentions and nested subpoints by keyboard, keeps their text, and restores the whole structure after a fresh-instance reload", async () => {
    let roundId = "";
    let columnId = "";
    let firstContentionId = "";
    let firstSubpointId = "";

    // --- Author phase: one service instance --------------------------------
    //
    // Create a round through the real round seam, then drive the whole
    // keyboard-first flow through the editable panel: C# drops contentions into
    // the active column, S# nests subpoints inside a contention's own editor.
    await withHarness(async ({ service, createRound }) => {
      await act(async () => {
        roundId = await createRound("Contention & subpoint e2e");
      });

      const handle = await service.open(roundId);
      await handle.whenLoaded;

      // One column for the debater to flow into.
      const col = addColumn(handle, { side: "aff", label: "1AC" });
      columnId = col.id;

      const view = render(<FlowSheetPanel handle={handle} />);

      // Activate the column - the C# trigger routes into the active column.
      const column = await view.findByTestId("speech-column");
      fireEvent.click(column);

      // Drop two contentions into the active column by keyboard - C1, then C2 -
      // no dialog. Both C# triggers are fired *before* any editor typing on
      // purpose: jsdom does not implement `HTMLElement.isContentEditable`, so the
      // document-wide C# listener cannot tell it is aimed at a contention's own
      // editor and would fold keystrokes typed into a contention into its own
      // token buffer (a real browser reports `isContentEditable === true` and the
      // trigger correctly ignores them). Building the contentions first keeps the
      // keyboard-first gesture faithful without tripping that jsdom gap.
      typeTrigger(document, ["C", "1", "Enter"]);
      await waitFor(() =>
        expect(listContentions(handle, col.id)).toHaveLength(1),
      );
      typeTrigger(document, ["C", "2", "Enter"]);
      await waitFor(() =>
        expect(listContentions(handle, col.id)).toHaveLength(2),
      );
      firstContentionId = listContentions(handle, col.id)[0].id;

      // Now nest two subpoints inside the first contention by typing S1, then S2
      // *inside that contention's own editor* (the opposite of C#: the S# trigger
      // fires from within the editable surface).
      const contentionNode = await waitFor(() => {
        const node = view
          .getAllByTestId("contention-node")
          .find((el) => el.getAttribute("data-flow-node-id") === firstContentionId);
        if (!node) throw new Error("first contention not rendered");
        return node;
      });
      const editor = await contentionEditorOf(contentionNode);
      typeTrigger(editor, ["S", "1", "Enter"]);
      await waitFor(() =>
        expect(listSubpoints(handle, firstContentionId)).toHaveLength(1),
      );
      firstSubpointId = listSubpoints(handle, firstContentionId)[0].id;
      await view.findByTestId("subpoint-node");

      typeTrigger(editor, ["S", "2", "Enter"]);
      await waitFor(() =>
        expect(listSubpoints(handle, firstContentionId)).toHaveLength(2),
      );

      // The ranks render live: C1/C2 on the contentions, S1/S2 on the first
      // contention's subpoints.
      await waitFor(() => {
        const contentionLabels = view
          .getAllByTestId("contention-label")
          .map((el) => el.textContent);
        expect(contentionLabels).toEqual(["C1", "C2"]);
      });
      const subpointLabels = view
        .getAllByTestId("subpoint-label")
        .map((el) => el.textContent);
      expect(subpointLabels).toEqual(["S1", "S2"]);

      // Unmount the panel so its editors detach from the fragments, then type
      // argument text through a single real Tiptap surface per node.
      view.unmount();
      writeFragmentText(
        handle,
        contentionContentFragment(firstContentionId),
        "framework comes first",
      );
      writeFragmentText(
        handle,
        subpointContentFragment(firstSubpointId),
        "uniqueness overwhelms the link",
      );
    });

    expect(roundId).not.toBe("");
    expect(firstContentionId).not.toBe("");
    expect(firstSubpointId).not.toBe("");

    // --- Restart phase: a completely fresh service over the same backend ----
    //
    // Nothing from the author phase survives in memory - only IndexedDB does.
    const restarted = openDocumentService();
    try {
      // The round is still registered and reopens by id.
      const rounds = await restarted.list();
      expect(rounds.map((r) => r.id)).toContain(roundId);

      const reopened = await restarted.open(roundId);
      await reopened.whenLoaded;

      // The column is restored.
      expect(listColumns(reopened).map((c) => c.id)).toEqual([columnId]);

      // Both contentions restored, in order, the first keeping its id.
      const contentions = listContentions(reopened, columnId);
      expect(contentions).toHaveLength(2);
      expect(contentions[0].id).toBe(firstContentionId);

      // Both subpoints restored, still nested under the first contention, in
      // order, the first keeping its id - and none under the second contention.
      const subpoints = listSubpoints(reopened, firstContentionId);
      expect(subpoints).toHaveLength(2);
      expect(subpoints[0].id).toBe(firstSubpointId);
      expect(subpoints.every((s) => s.contentionId === firstContentionId)).toBe(
        true,
      );
      expect(listSubpoints(reopened, contentions[1].id)).toHaveLength(0);

      // The argument texts survived in their per-node fragments.
      expect(
        reopened.doc
          .getXmlFragment(contentionContentFragment(firstContentionId))
          .toString(),
      ).toContain("framework comes first");
      expect(
        reopened.doc
          .getXmlFragment(subpointContentFragment(firstSubpointId))
          .toString(),
      ).toContain("uniqueness overwhelms the link");

      // ...and rendered through the real panel, the restored structure paints:
      // two contentions (C1/C2), the first nesting its subpoints (S1/S2).
      render(<FlowSheetPanel handle={reopened} />);

      await waitFor(() => {
        const contentionLabels = screen
          .getAllByTestId("contention-label")
          .map((el) => el.textContent);
        expect(contentionLabels).toEqual(["C1", "C2"]);
      });

      const firstContentionNode = screen
        .getAllByTestId("contention-node")
        .find((el) => el.getAttribute("data-flow-node-id") === firstContentionId);
      expect(firstContentionNode).toBeDefined();
      await waitFor(() => {
        const labels = within(firstContentionNode!)
          .getAllByTestId("subpoint-label")
          .map((el) => el.textContent);
        expect(labels).toEqual(["S1", "S2"]);
      });
    } finally {
      await restarted.close();
    }
  });
});
