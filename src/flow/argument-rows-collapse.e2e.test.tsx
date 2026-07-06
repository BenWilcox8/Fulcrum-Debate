// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern every document / flow / round test uses.
//
// This is the whole-stack closeout for the **Argument Rows & Collapsing** PRD
// (slice 3/3). It composes the two tracks that landed separately - argument-row
// structure inside a box (Enter / Shift+Enter, dividers, persistence, legacy
// migration) and node collapsing view-state (header toggle, Collapse All Except
// Active by button and by Ctrl+\) - the way the app ships them, with no mocks: a
// round is a flow-sheet document created through the real round seam
// (`useRounds`); the editable flow sheet (`FlowSheetPanel`) hosts the XYFlow
// canvas and the C# contention trigger; each contention's argument text is a real
// Tiptap surface bound to its per-node fragment through the exact
// `FLOW_ARGUMENT_PRESET` composition `useFlowNodeEditor` ships.
//
// The shape is:
//   1. Author a round on one service instance: drop two contentions by keyboard
//      (C#), then drive the **collapse** track through the rendered panel -
//      collapse a contention to a bar via its header, expand it via the bar, then
//      Collapse All Except Active by the toolbar button *and* by the Ctrl+\
//      hotkey.
//   2. Build **argument-row** structure inside the first contention by keyboard -
//      Enter for a new top-level argument row, Shift+Enter for a grouped response
//      - proving the keymap wins over the editor's baseline Enter, and that the
//      dividers (`data-flow-response` hooks) render.
//   3. Throw the whole instance away and reopen the same IndexedDB backend through
//      a completely fresh service (the restart) and assert the keyboard-built
//      argument/response grouping survived and stays addressable
//      (`locateArgumentRows`). Collapse is transient view-state by design, so the
//      reload is expected to start fully expanded - only the argument structure is
//      asserted to persist.
//
// Assertions stay behavioural (model snapshots, rendered `data-*` hooks, document
// JSON), never Yjs internals or XYFlow measurement (which does not run under
// jsdom).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { Editor, JSONContent } from "@tiptap/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  render,
  waitFor,
  act,
  fireEvent,
  within,
} from "@testing-library/react";

import { DocumentsProvider, useDocumentService } from "../documents/react";
import { useRounds } from "../rounds";
import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  addColumn,
  contentionContentFragment,
  listContentions,
  locateArgumentRows,
  migrateFlowNodeFragment,
  ARGUMENT_NODE_NAME,
  RESPONSE_NODE_NAME,
} from "./index";
import { FlowSheetPanel } from "./canvas";
import { FLOW_ARGUMENT_PRESET } from "./canvas/flow-argument-preset";

// A fresh IndexedDB backend per test so nothing leaks between tests. The two
// service instances in each test share this one backend - that shared backend
// *is* the persistence under test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

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

/** The rendered contention container element for one node id. */
const contentionEl = (container: HTMLElement, id: string): HTMLElement => {
  const el = container.querySelector<HTMLElement>(
    `[data-testid="contention-node"][data-flow-node-id="${id}"]`,
  );
  if (!el) throw new Error(`no contention node rendered for ${id}`);
  return el;
};

/**
 * Build a flow-node text surface editor exactly as `useFlowNodeEditor` ships it:
 * run the legacy-content migration first, then create over the per-node fragment
 * with the shared `FLOW_ARGUMENT_PRESET` (argument-row schema + Enter/Shift+Enter
 * keymap). jsdom cannot type real text through the *rendered* panel editor, so
 * the faithful keyboard-driven argument authoring is a genuine editor over the
 * same fragment the panel binds to.
 */
function openFlowNodeEditor(handle: DocumentHandle, fragment: string): Editor {
  migrateFlowNodeFragment(handle.doc, handle.doc.getXmlFragment(fragment));
  return createEditor({
    binding: { handle, fragment },
    extensions: editorPreset(FLOW_ARGUMENT_PRESET),
  });
}

/** The doc JSON's top-level argument children. */
const argumentsOf = (editor: Editor): JSONContent[] => editor.getJSON().content ?? [];
/** The response children of one argument JSON node. */
const responsesOf = (argument: JSONContent): JSONContent[] => argument.content ?? [];
/** Flattened text of a JSON subtree. */
const textOf = (node: JSONContent): string =>
  node.type === "text" ? (node.text ?? "") : (node.content ?? []).map(textOf).join("");

describe("argument rows + node collapsing end-to-end", () => {
  it("builds argument/response structure by keyboard (persisted) and collapses containers by header, button, and hotkey", async () => {
    let roundId = "";
    let columnId = "";
    let c1Id = "";

    // --- Author phase: one service instance --------------------------------
    await withHarness(async ({ service, createRound }) => {
      await act(async () => {
        roundId = await createRound("Argument rows & collapsing e2e");
      });

      const handle = await service.open(roundId);
      await handle.whenLoaded;

      const col = addColumn(handle, { side: "aff", label: "1AC" });
      columnId = col.id;

      const view = render(<FlowSheetPanel handle={handle} />);

      // Activate the column - the C# trigger routes into the active column.
      const column = await view.findByTestId("speech-column");
      fireEvent.click(column);

      // Drop two contentions by keyboard - C1, then C2 - no dialog. Both C#
      // gestures fire *before* any editor typing: jsdom does not implement
      // `HTMLElement.isContentEditable`, so the document-wide C# listener cannot
      // tell a keystroke was aimed at a contention's editor and would fold it
      // into its token buffer (a real browser reports `true` and ignores it).
      typeTrigger(document, ["C", "1", "Enter"]);
      await waitFor(() =>
        expect(listContentions(handle, col.id)).toHaveLength(1),
      );
      typeTrigger(document, ["C", "2", "Enter"]);
      await waitFor(() =>
        expect(listContentions(handle, col.id)).toHaveLength(2),
      );
      const contentions = listContentions(handle, col.id);
      c1Id = contentions[0].id;
      const c2Id = contentions[1].id;
      const { container } = view;

      // === Collapse track (through the real panel) ========================

      // Collapse via header: the container drops its body and reads as a bar.
      const c1 = contentionEl(container, c1Id);
      expect(c1).not.toHaveAttribute("data-collapsed");
      expect(within(c1).queryByTestId("contention-body")).not.toBeNull();

      fireEvent.click(within(c1).getByTestId("contention-header"));
      await waitFor(() =>
        expect(contentionEl(container, c1Id)).toHaveAttribute(
          "data-collapsed",
          "true",
        ),
      );
      expect(
        within(contentionEl(container, c1Id)).queryByTestId("contention-body"),
      ).toBeNull();

      // Expand via the bar (the header): the body returns. c1 is now the active
      // node (its header was the last interaction).
      fireEvent.click(
        within(contentionEl(container, c1Id)).getByTestId("contention-header"),
      );
      await waitFor(() =>
        expect(contentionEl(container, c1Id)).not.toHaveAttribute("data-collapsed"),
      );
      expect(
        within(contentionEl(container, c1Id)).queryByTestId("contention-body"),
      ).not.toBeNull();

      // Collapse All Except Active via the toolbar button: c1 (active) stays
      // expanded, c2 collapses to a bar.
      fireEvent.click(view.getByTestId("collapse-all-except-active"));
      await waitFor(() =>
        expect(contentionEl(container, c2Id)).toHaveAttribute(
          "data-collapsed",
          "true",
        ),
      );
      expect(contentionEl(container, c1Id)).not.toHaveAttribute("data-collapsed");

      // Now make c2 the active node (clicking its header expands it and marks it
      // active), then Collapse All Except Active via the Ctrl+\ hotkey: c2 stays
      // expanded, c1 collapses.
      fireEvent.click(
        within(contentionEl(container, c2Id)).getByTestId("contention-header"),
      );
      await waitFor(() =>
        expect(contentionEl(container, c2Id)).not.toHaveAttribute("data-collapsed"),
      );

      fireEvent.keyDown(document, { key: "\\", ctrlKey: true });
      await waitFor(() =>
        expect(contentionEl(container, c1Id)).toHaveAttribute(
          "data-collapsed",
          "true",
        ),
      );
      expect(contentionEl(container, c2Id)).not.toHaveAttribute("data-collapsed");

      // === Argument-row track (real editor over the contention fragment) ===

      // Detach the panel's editors from the fragments first, then author the
      // argument rows through a single real Tiptap surface over c1's fragment -
      // the exact `FLOW_ARGUMENT_PRESET` composition the panel ships.
      view.unmount();

      const fragment = contentionContentFragment(c1Id);
      const editor = openFlowNodeEditor(handle, fragment);
      try {
        const dom = editor.view.dom;

        editor.chain().focus().insertContent("perm do both").run();
        // Enter -> a new top-level argument row (the keymap wins over the
        // editor's baseline block-split); the caret rides into the fresh row.
        fireEvent.keyDown(dom, { key: "Enter" });
        editor.chain().insertContent("no link to the DA").run();
        // Shift+Enter -> a grouped response appended to the *current* argument,
        // staying in the same box (the divider renders between the responses).
        fireEvent.keyDown(dom, { key: "Enter", shiftKey: true });
        editor.chain().insertContent("turn: link is offense").run();

        const args = argumentsOf(editor);
        expect(args).toHaveLength(2);
        expect(responsesOf(args[0])).toHaveLength(1);
        expect(responsesOf(args[1])).toHaveLength(2);
        expect(textOf(args[0])).toBe("perm do both");
        expect(textOf(responsesOf(args[1])[0])).toBe("no link to the DA");
        expect(textOf(responsesOf(args[1])[1])).toBe("turn: link is offense");

        // The dividers render: three responses -> three `data-flow-response`
        // hooks, the seam the divider CSS keys off.
        const html = editor.getHTML();
        expect(html).toContain("data-flow-argument");
        expect(html.match(/data-flow-response/g) ?? []).toHaveLength(3);
      } finally {
        editor.destroy();
      }
    });

    expect(roundId).not.toBe("");
    expect(c1Id).not.toBe("");

    // --- Restart phase: a completely fresh service over the same backend ----
    //
    // Nothing from the author phase survives in memory - only IndexedDB does.
    // Collapse is transient view-state, so it is expected to reset; the
    // keyboard-built argument/response grouping is what must persist.
    const restarted = openDocumentService();
    try {
      const rounds = await restarted.list();
      expect(rounds.map((r) => r.id)).toContain(roundId);

      const reopened = await restarted.open(roundId);
      await reopened.whenLoaded;

      // The two contentions are restored under the column.
      expect(listContentions(reopened, columnId)).toHaveLength(2);

      // The argument-row grouping survived and stays addressable: two top-level
      // argument rows, the second grouping two responses, the text intact.
      const editor = openFlowNodeEditor(reopened, contentionContentFragment(c1Id));
      try {
        const located = locateArgumentRows(editor.state.doc);
        expect(located).toHaveLength(2);
        expect(located[0].responses).toHaveLength(1);
        expect(located[1].responses).toHaveLength(2);

        // Each located span resolves to the node type it claims.
        expect(editor.state.doc.nodeAt(located[0].from)?.type.name).toBe(
          ARGUMENT_NODE_NAME,
        );
        expect(
          editor.state.doc.nodeAt(located[1].responses[1].from)?.type.name,
        ).toBe(RESPONSE_NODE_NAME);

        const doc = editor.state.doc;
        const text = doc.textBetween(0, doc.content.size, "\n", " ");
        expect(text).toContain("perm do both");
        expect(text).toContain("no link to the DA");
        expect(text).toContain("turn: link is offense");
      } finally {
        editor.destroy();
      }
    } finally {
      await restarted.close();
    }
  });
});
