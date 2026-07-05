// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern every document / flow / round test uses.
//
// This is the whole-stack end-to-end proof for the flow-sheet scaffold. It
// drives the *real* stack over a *real* document handle, top to bottom, with no
// mocks: the round seam (a round is a flow-sheet document created through the
// document service), the flow-sheet column model, the node-container model, and
// - after a simulated restart - the XYFlow canvas hosting a registered node
// kind. It deliberately spans every layer the earlier tasks unit-tested in
// isolation, to catch a seam that only breaks when the pieces are composed.
//
// The shape is: author a round on one service instance (create the round, add /
// relabel / reorder columns, place a stub node in a column), throw that instance
// away, then reopen the same IndexedDB backend through a *completely fresh*
// service (the restart) and assert everything is restored - columns in order,
// their labels, and the node still in its column - both at the model level and
// rendered through the real canvas. Assertions stay behavioural (model
// snapshots, rendered presence), never Yjs internals or pixels.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { NodeProps } from "@xyflow/react";
import { beforeEach, describe, expect, it } from "vitest";
import { render, waitFor, act, screen } from "@testing-library/react";

import { DocumentsProvider, useDocumentService } from "../documents/react";
import { useRounds } from "../rounds";
import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import {
  addColumn,
  addNode,
  listColumnNodes,
  listColumns,
  moveColumn,
  relabelColumn,
} from "./index";
import { FlowCanvas } from "./canvas";
import type { FlowNodeRegistry, HostedFlowNode } from "./canvas";

// A fresh IndexedDB backend per test so nothing leaks between tests. The two
// service instances in each test share this one backend - that shared backend
// *is* the persistence under test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

// --- The test-only stub node kind ------------------------------------------
//
// The scaffold ships no real node kinds (contentions/subpoints are their own
// PRDs). This stub is the minimal implementation of a registered kind - a
// `kind` string plus a component that renders its identity - used only to prove
// a node placed on the model is hosted inside its column purely by registering
// the kind, with no canvas edits.
const STUB_KIND = "stub";

function StubFlowNode({ data }: NodeProps<HostedFlowNode>) {
  return (
    <div
      data-testid="stub-flow-node"
      data-flow-node-id={data.flowNodeId}
      data-column-id={data.columnId}
    >
      {data.kind}
    </div>
  );
}

const STUB_REGISTRY: FlowNodeRegistry = [
  { kind: STUB_KIND, component: StubFlowNode },
];

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

describe("flow-sheet end-to-end", () => {
  it("restores columns, order, labels, and a placed node after a fresh-instance reload", async () => {
    let roundId = "";
    let nodeColumnId = "";

    // --- Author phase: one service instance --------------------------------
    //
    // Create a round through the real round seam, then drive the flow-sheet
    // model on the round's own handle: three columns, a relabel, a reorder, and
    // a stub node placed in one column.
    await withHarness(async ({ service, createRound }) => {
      await act(async () => {
        roundId = await createRound("E2E round");
      });

      await act(async () => {
        const handle = await service.open(roundId);
        await handle.whenLoaded;

        // Three columns in speech order.
        const c1 = addColumn(handle, { side: "aff", label: "1AC" });
        addColumn(handle, { side: "neg", label: "1NC" });
        const c3 = addColumn(handle, { side: "aff", label: "2A" });

        // Relabel the third column: 2A -> 2AC.
        relabelColumn(handle, c3.id, "2AC");

        // Reorder: move 2AC to the front, so order becomes 2AC, 1AC, 1NC.
        moveColumn(handle, c3.id, 0);

        // Place a stub node in the first column (1AC).
        addNode(handle, { columnId: c1.id, kind: STUB_KIND });
        nodeColumnId = c1.id;
      });
    });

    expect(roundId).not.toBe("");
    expect(nodeColumnId).not.toBe("");

    // --- Restart phase: a completely fresh service over the same backend ----
    //
    // Nothing from the author phase survives in memory - only IndexedDB does.
    const restarted = openDocumentService();
    let reopened: DocumentHandle;
    try {
      // The round is still registered and reopens by id.
      const rounds = await restarted.list();
      expect(rounds.map((r) => r.id)).toContain(roundId);

      reopened = await restarted.open(roundId);
      await reopened.whenLoaded;

      // Columns restored, in the reordered sequence, with the persisted labels.
      const columns = listColumns(reopened);
      expect(columns.map((c) => c.label)).toEqual(["2AC", "1AC", "1NC"]);
      expect(columns.map((c) => c.side)).toEqual(["aff", "aff", "neg"]);

      // The node is restored, still in its column, with its kind.
      const nodes = listColumnNodes(reopened, nodeColumnId);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].kind).toBe(STUB_KIND);
      expect(nodes[0].columnId).toBe(nodeColumnId);

      // ...and rendered through the real canvas, the stub node is hosted inside
      // its column: the registered kind renders with no canvas edits.
      render(<FlowCanvas handle={reopened} flowNodeTypes={STUB_REGISTRY} />);

      const stub = await screen.findByTestId("stub-flow-node");
      expect(stub).toHaveAttribute("data-column-id", nodeColumnId);

      // The reordered columns render in order alongside it.
      await waitFor(() => {
        const labels = screen
          .getAllByTestId("speech-column")
          .map((el) => el.textContent);
        expect(labels).toEqual(["2AC", "1AC", "1NC"]);
      });
    } finally {
      await restarted.close();
    }
  });
});
