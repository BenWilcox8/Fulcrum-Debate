// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the established document-layer test
// pattern). These tests drive the canvas over a *real* flow-sheet handle - no
// mocks - and assert on structure/behaviour (node counts, order, side classes,
// live reaction to column changes), never on XYFlow measurement or pixels,
// which do not run under jsdom.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, act, renderHook } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import {
  addColumn,
  moveColumn,
  relabelColumn,
  removeColumn,
} from "../columns";
import { FlowCanvas } from "./FlowCanvas";
import { useColumnNodes } from "./useColumnNodes";

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `flow-${Date.now()}-${nextId++}`;

/** Opens a loaded flow-sheet handle over a fresh id. */
const openFlowSheet = async (id = uniqueId()): Promise<DocumentHandle> => {
  const handle = openDocument({ id, kind: "flow-sheet" });
  await handle.whenLoaded;
  return handle;
};

// --- The live column -> node seam (useColumnNodes) -------------------------
//
// The pure mapping and the node component are covered in their own files. This
// group covers the live wiring end-to-end over a real handle: the reliable,
// measurement-free layer where the "reflects live flow-doc changes" acceptance
// criterion is asserted behaviourally.
describe("useColumnNodes", () => {
  it("yields an empty node list for a null handle", () => {
    const { result } = renderHook(() => useColumnNodes(null));
    expect(result.current).toEqual([]);
  });

  it("maps the current columns in document order", async () => {
    const handle = await openFlowSheet();
    addColumn(handle, { side: "aff", label: "1AC" });
    addColumn(handle, { side: "neg", label: "1NC" });

    const { result } = renderHook(() => useColumnNodes(handle));

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((n) => n.data.label)).toEqual(["1AC", "1NC"]);
    expect(result.current.map((n) => n.data.side)).toEqual(["aff", "neg"]);
  });

  it("reflects add, relabel, reorder, and remove live", async () => {
    const handle = await openFlowSheet();
    const { result } = renderHook(() => useColumnNodes(handle));

    // Add
    let aff!: { id: string };
    let neg!: { id: string };
    act(() => {
      aff = addColumn(handle, { side: "aff", label: "1AC" });
      neg = addColumn(handle, { side: "neg", label: "1NC" });
    });
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((n) => n.id)).toEqual([aff.id, neg.id]);

    // Relabel
    act(() => {
      relabelColumn(handle, aff.id, "1AC (renamed)");
    });
    await waitFor(() =>
      expect(result.current[0].data.label).toBe("1AC (renamed)"),
    );

    // Reorder: move the neg column to the front
    act(() => {
      moveColumn(handle, neg.id, 0);
    });
    await waitFor(() =>
      expect(result.current.map((n) => n.id)).toEqual([neg.id, aff.id]),
    );

    // Remove
    act(() => {
      removeColumn(handle, aff.id);
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].id).toBe(neg.id);
  });
});

// --- The rendered canvas (FlowCanvas) --------------------------------------
describe("FlowCanvas", () => {
  it("renders its surface synchronously with a null handle (no async gate)", () => {
    const { getByTestId } = render(<FlowCanvas handle={null} />);
    // The local-first boot rule: the surface paints immediately, no spinner.
    expect(getByTestId("flow-canvas")).toBeInTheDocument();
  });

  it("wrapper div carries h-full and w-full so the ancestor flex chain can fill it", () => {
    // Regression: the canvas container must declare h-full/w-full so that a
    // parent flex chain with a definite height (h-screen on RootLayout) can
    // propagate that height all the way down to the XYFlow surface. Without
    // these classes the ResizeObserver always measures 0 and column heights
    // stay at the DEFAULT_COLUMN_HEIGHT fallback forever.
    const { getByTestId } = render(<FlowCanvas handle={null} />);
    const wrapper = getByTestId("flow-canvas");
    expect(wrapper.className).toMatch(/\bh-full\b/);
    expect(wrapper.className).toMatch(/\bw-full\b/);
  });

  it("renders one full-height, side-coloured column per flow-doc column", async () => {
    const handle = await openFlowSheet();
    addColumn(handle, { side: "aff", label: "1AC" });
    addColumn(handle, { side: "neg", label: "1NC" });
    addColumn(handle, { side: "aff", label: "2AC" });

    const { findAllByTestId } = render(<FlowCanvas handle={handle} />);

    const columns = await findAllByTestId("speech-column");
    expect(columns).toHaveLength(3);
    expect(columns.map((c) => c.getAttribute("data-side"))).toEqual([
      "aff",
      "neg",
      "aff",
    ]);
    // Aff and neg are visibly distinct via the design tokens.
    expect(columns[0].className).toContain("bg-aff-soft");
    expect(columns[1].className).toContain("bg-neg-soft");
    expect(columns[0].className).not.toEqual(columns[1].className);
  });

  it("shows the empty-flow hint when a live handle has zero columns", async () => {
    const handle = await openFlowSheet();
    const { getByText } = render(<FlowCanvas handle={handle} />);
    await waitFor(() =>
      expect(getByText("No speech columns yet")).toBeInTheDocument(),
    );
  });

  it("does not show the empty-flow hint once the flow sheet has at least one column", async () => {
    const handle = await openFlowSheet();
    addColumn(handle, { side: "aff", label: "1AC" });
    const { queryByText } = render(<FlowCanvas handle={handle} />);
    await waitFor(() =>
      expect(queryByText("No speech columns yet")).not.toBeInTheDocument(),
    );
  });

  it("clears the empty-flow hint when the first column is added", async () => {
    const handle = await openFlowSheet();
    const { getByText, queryByText } = render(<FlowCanvas handle={handle} />);
    await waitFor(() =>
      expect(getByText("No speech columns yet")).toBeInTheDocument(),
    );
    act(() => {
      addColumn(handle, { side: "aff", label: "1AC" });
    });
    await waitFor(() =>
      expect(queryByText("No speech columns yet")).not.toBeInTheDocument(),
    );
  });

  it("does not show the empty-flow hint when the handle is null", () => {
    const { queryByText } = render(<FlowCanvas handle={null} />);
    expect(queryByText("No speech columns yet")).not.toBeInTheDocument();
  });

  it("reflects live flow-doc changes in the rendered columns", async () => {
    const handle = await openFlowSheet();
    const first = addColumn(handle, { side: "aff", label: "1AC" });

    const { findAllByTestId, queryAllByTestId } = render(
      <FlowCanvas handle={handle} />,
    );
    await waitFor(() =>
      expect(queryAllByTestId("speech-column")).toHaveLength(1),
    );

    // Add a second column.
    act(() => {
      addColumn(handle, { side: "neg", label: "1NC" });
    });
    await waitFor(() =>
      expect(queryAllByTestId("speech-column")).toHaveLength(2),
    );

    // Remove the first.
    act(() => {
      removeColumn(handle, first.id);
    });
    await waitFor(() =>
      expect(queryAllByTestId("speech-column")).toHaveLength(1),
    );
    const [remaining] = await findAllByTestId("speech-column");
    expect(remaining).toHaveAttribute("data-side", "neg");
  });
});
