// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern every document / flow / round test uses.
//
// This is the whole-stack closeout for the **DnD/Strike** PRD (slice 3/3). It
// composes the two tracks that landed separately - cross-application drag (copy
// + transparent arrow, orphan-edge cleanup) and strike-on-drop (adjacency
// detection, non-destructive strike, single-transaction clash gesture) - the way
// the app ships them through `FlowSheetPanel`'s drop handler, with no mocks: a
// round is a flow-sheet document created through the real round seam
// (`useRounds`); each contention's argument text is a real Tiptap surface bound
// to its per-node fragment through the exact `FLOW_ARGUMENT_PRESET` composition
// `useFlowNodeEditor` ships.
//
// XYFlow's node drag is d3-drag and needs real DOM measurement (jsdom measures
// nothing), so the *pointer gesture* is verified in a real browser (see the
// cross-apply / strike docblocks). What jsdom *can* prove faithfully is the whole
// path the drop handler runs once the browser has measured: the pure drop
// geometry the canvas delegates to (`resolveNodeDropColumn` picks the target
// column, `resolveAdjacentNode` picks the opponent argument), and then the exact
// model mutation `FlowSheetPanel.onNodeCrossColumnDrop` performs - one
// `doc.transact` that cross-applies AND strikes. This e2e drives that real path
// end to end.
//
// The shape is:
//   1. Author a round on one service instance: an aff column with my argument and
//      a neg column with the opponent's, each carrying real keyboard-built text.
//   2. Resolve a drag of my argument onto the neg column, landing adjacent to the
//      opponent's argument, through the canvas's own pure geometry - proving the
//      geometry the browser drag feeds the handler picks the right column + node.
//   3. Run the clash gesture the handler runs (crossApply + strike in one
//      `doc.transact`) under a Yjs `UndoManager` scoped to the flow's `nodes` and
//      `edges` stores, and assert: a copy lands in the neg column (the original
//      stays put), a source->copy arrow is recorded, the opponent is struck (its
//      text intact - strike is non-destructive), and the whole gesture is a
//      *single* undo step that one `undo()` fully reverts (copy gone, arrow gone,
//      strike cleared). `redo()` reinstates the clash for the reload check.
//   4. Throw the instance away and reopen the same IndexedDB backend through a
//      completely fresh service (the restart) and assert the copy, its cloned
//      argument text, the arrow, and the strike all survived.
//
// Assertions stay behavioural (model snapshots, document JSON, Yjs undo-stack
// depth), never XYFlow measurement (which does not run under jsdom).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { UndoManager } from "yjs";
import type { Editor } from "@tiptap/core";
import { beforeEach, describe, expect, it } from "vitest";
import { render, waitFor, act } from "@testing-library/react";

import { DocumentsProvider, useDocumentService } from "../documents/react";
import { useRounds } from "../rounds";
import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  addColumn,
  addContention,
  contentionContentFragment,
  crossApplyContention,
  isNodeStruck,
  listContentions,
  listEdges,
  migrateFlowNodeFragment,
  setNodeStruck,
  CROSS_APPLICATION_EDGE_KIND,
  FLOW_EDGES_FRAGMENT,
  FLOW_NODES_FRAGMENT,
} from "./index";
import {
  columnX,
  flowNodeY,
  resolveAdjacentNode,
  resolveNodeDropColumn,
  COLUMN_WIDTH,
  CONTENTION_NODE_HEIGHT,
  FLOW_NODE_WIDTH,
  type DropColumn,
  type DropTargetNode,
} from "./canvas";
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

/**
 * Build a flow-node text surface editor exactly as `useFlowNodeEditor` ships it:
 * run the legacy-content migration first, then create over the per-node fragment
 * with the shared `FLOW_ARGUMENT_PRESET`. jsdom cannot type through the rendered
 * panel editor, so faithful text authoring is a genuine editor over the same
 * fragment the panel binds to (the argument-rows e2e uses the same helper).
 */
function openFlowNodeEditor(handle: DocumentHandle, fragment: string): Editor {
  migrateFlowNodeFragment(handle.doc, handle.doc.getXmlFragment(fragment));
  return createEditor({
    binding: { handle, fragment },
    extensions: editorPreset(FLOW_ARGUMENT_PRESET),
  });
}

/** Author `text` into a contention's argument surface and detach the editor. */
function authorContention(
  handle: DocumentHandle,
  nodeId: string,
  text: string,
): void {
  const editor = openFlowNodeEditor(handle, contentionContentFragment(nodeId));
  try {
    editor.chain().focus().insertContent(text).run();
  } finally {
    editor.destroy();
  }
}

/** The flattened text of a contention's argument surface. */
function readContentionText(handle: DocumentHandle, nodeId: string): string {
  const editor = openFlowNodeEditor(handle, contentionContentFragment(nodeId));
  try {
    const doc = editor.state.doc;
    return doc.textBetween(0, doc.content.size, "\n", " ");
  } finally {
    editor.destroy();
  }
}

describe("cross-application drag + strike-on-drop end-to-end", () => {
  it("drops a copy with a source->copy arrow, strikes the adjacent opponent, is one undo step, and persists", async () => {
    let roundId = "";
    let affColumnId = "";
    let negColumnId = "";
    let mineId = "";
    let opponentId = "";
    let copyId = "";

    // --- Author phase: one service instance --------------------------------
    await withHarness(async ({ service, createRound }) => {
      await act(async () => {
        roundId = await createRound("DnD / Strike e2e");
      });

      const handle = await service.open(roundId);
      await handle.whenLoaded;

      // Two columns, one contention (argument) in each: mine in the aff column,
      // the opponent's in the neg column - the clash setup.
      const aff = addColumn(handle, { side: "aff", label: "1AC" });
      const neg = addColumn(handle, { side: "neg", label: "1NC" });
      affColumnId = aff.id;
      negColumnId = neg.id;

      const mine = addContention(handle, aff.id);
      const opponent = addContention(handle, neg.id);
      mineId = mine.id;
      opponentId = opponent.id;

      authorContention(handle, mine.id, "perm solves the net benefit");
      authorContention(handle, opponent.id, "counterplan competes");

      // === Resolve the drag through the canvas's own pure geometry ===========
      //
      // The browser measures the DOM and hands the drop handler a dragged node
      // position; the handler resolves the target column + adjacent node with
      // these pure functions. We feed them a faithful layout: two side-by-side
      // columns, my argument dragged so its center lands over the neg column and
      // vertically inside the opponent argument's slot.
      const columns: DropColumn[] = [
        { id: aff.id, x: columnX(0), width: COLUMN_WIDTH },
        { id: neg.id, x: columnX(1), width: COLUMN_WIDTH },
      ];
      // Drag my argument right so its horizontal center falls in the neg column.
      const negCenterX = columnX(1) + COLUMN_WIDTH / 2;
      const nodeRelX = negCenterX - columnX(0) - FLOW_NODE_WIDTH / 2;
      const targetColumnId = resolveNodeDropColumn({
        sourceColumnId: aff.id,
        nodeRelX,
        nodeWidth: FLOW_NODE_WIDTH,
        columns,
      });
      expect(targetColumnId).toBe(neg.id);

      // Vertically, drop inside the opponent argument's slot (index 0 of neg).
      const opponentSlots: DropTargetNode[] = [
        {
          id: opponent.id,
          y: flowNodeY(0, CONTENTION_NODE_HEIGHT),
          height: CONTENTION_NODE_HEIGHT,
        },
      ];
      const centerY = flowNodeY(0, CONTENTION_NODE_HEIGHT) + CONTENTION_NODE_HEIGHT / 2;
      const adjacentNodeId = resolveAdjacentNode(centerY, opponentSlots);
      expect(adjacentNodeId).toBe(opponent.id);

      // === Run the clash gesture the drop handler runs =======================
      //
      // One `doc.transact` that cross-applies my argument into the neg column
      // (copy + arrow) AND strikes the opponent argument it landed adjacent to -
      // mirroring `FlowSheetPanel.onNodeCrossColumnDrop`. A Yjs UndoManager scoped
      // to the flow's `nodes` and `edges` stores captures the whole gesture so we
      // can prove it is a single undo step. (The copy's own content fragment is a
      // separate top-level type; the observable clash - the copy node, the arrow,
      // the strike flag - all live in these two stores.)
      const nodesMap = handle.doc.getMap(FLOW_NODES_FRAGMENT);
      const edgesMap = handle.doc.getMap(FLOW_EDGES_FRAGMENT);
      const undo = new UndoManager([nodesMap, edgesMap], {
        captureTimeout: 0,
      });

      let copy: ReturnType<typeof crossApplyContention> | undefined;
      handle.doc.transact(() => {
        copy = crossApplyContention(handle, mineId, targetColumnId!);
        if (adjacentNodeId) setNodeStruck(handle, adjacentNodeId, true);
      });
      copyId = copy!.id;

      // --- The clash result --------------------------------------------------

      // The copy landed in the neg column; the original stayed put in aff.
      const negContentions = listContentions(handle, neg.id);
      expect(negContentions.map((c) => c.id)).toEqual([opponent.id, copyId]);
      expect(listContentions(handle, aff.id).map((c) => c.id)).toEqual([mineId]);

      // The copy is a true independent copy - its argument text matches at copy
      // time (it can then diverge, per crossApplyContention).
      expect(readContentionText(handle, copyId)).toBe(
        "perm solves the net benefit",
      );

      // The transparent arrow points from the original to the copy.
      const edges = listEdges(handle);
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceNodeId).toBe(mineId);
      expect(edges[0].targetNodeId).toBe(copyId);
      expect(edges[0].kind).toBe(CROSS_APPLICATION_EDGE_KIND);

      // The opponent argument is struck; the copy and the original are not.
      expect(isNodeStruck(handle, opponent.id)).toBe(true);
      expect(isNodeStruck(handle, copyId)).toBe(false);
      expect(isNodeStruck(handle, mineId)).toBe(false);
      // The strike is non-destructive: the opponent's text is untouched.
      expect(readContentionText(handle, opponent.id)).toBe(
        "counterplan competes",
      );

      // === One drag gesture = one undo step ==================================
      expect(undo.undoStack).toHaveLength(1);

      undo.undo();

      // One undo reverted the whole clash: no copy, no arrow, no strike.
      expect(listContentions(handle, neg.id).map((c) => c.id)).toEqual([
        opponent.id,
      ]);
      expect(listEdges(handle)).toHaveLength(0);
      expect(isNodeStruck(handle, opponent.id)).toBe(false);
      // My original argument survived the undo intact.
      expect(readContentionText(handle, mineId)).toBe(
        "perm solves the net benefit",
      );

      // Reinstate the clash (as a real redo would) so it persists to the reload.
      undo.redo();
      expect(listContentions(handle, neg.id).map((c) => c.id)).toEqual([
        opponent.id,
        copyId,
      ]);
      expect(listEdges(handle)).toHaveLength(1);
      expect(isNodeStruck(handle, opponent.id)).toBe(true);

      undo.destroy();
    });

    expect(roundId).not.toBe("");
    expect(copyId).not.toBe("");

    // --- Restart phase: a completely fresh service over the same backend ----
    //
    // Nothing from the author phase survives in memory - only IndexedDB does.
    const restarted = openDocumentService();
    try {
      const rounds = await restarted.list();
      expect(rounds.map((r) => r.id)).toContain(roundId);

      const reopened = await restarted.open(roundId);
      await reopened.whenLoaded;

      // The cross-applied copy is restored in the neg column, alongside the
      // opponent's original argument.
      expect(listContentions(reopened, negColumnId).map((c) => c.id)).toEqual([
        opponentId,
        copyId,
      ]);
      expect(listContentions(reopened, affColumnId).map((c) => c.id)).toEqual([
        mineId,
      ]);

      // The copy's cloned argument text survived intact.
      expect(readContentionText(reopened, copyId)).toBe(
        "perm solves the net benefit",
      );

      // The transparent arrow (original -> copy) survived.
      const edges = listEdges(reopened);
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceNodeId).toBe(mineId);
      expect(edges[0].targetNodeId).toBe(copyId);
      expect(edges[0].kind).toBe(CROSS_APPLICATION_EDGE_KIND);

      // The strike survived (it is a field on the persisted `nodes` map).
      expect(isNodeStruck(reopened, opponentId)).toBe(true);
      expect(isNodeStruck(reopened, copyId)).toBe(false);
      expect(isNodeStruck(reopened, mineId)).toBe(false);
    } finally {
      await restarted.close();
    }
  });
});
