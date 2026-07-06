// jsdom has no IndexedDB; install the in-memory fake first (document-layer
// pattern). This drives the whole node-collapse seam through the *real* editable
// flow sheet (FlowSheetPanel): clicking a contention/subpoint header collapses it
// to a single horizontal bar and clicking the bar expands it; the "Collapse All
// Except Active" button and the Ctrl+\ hotkey collapse every container except the
// active (last-interacted) one. Assertions are structural (rendered presence,
// data-collapsed hooks), never XYFlow measurement, which does not run under jsdom.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor, fireEvent, within } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn } from "../columns";
import { addContention } from "../contention";
import { addSubpoint, removeSubpoint } from "../subpoint";
import { removeNode } from "../nodes";
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

/** The rendered container element for one flow node, by its id. */
const nodeEl = (container: HTMLElement, id: string): HTMLElement => {
  const el = container.querySelector<HTMLElement>(
    `[data-testid="contention-node"][data-flow-node-id="${id}"]`,
  );
  if (!el) throw new Error(`no contention node rendered for ${id}`);
  return el;
};

describe("FlowSheetPanel node collapsing", () => {
  it("collapses a contention to a bar on header click and expands it on click", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);

    const { container, findByTestId } = render(
      <FlowSheetPanel handle={handle} />,
    );
    await findByTestId("contention-node");

    const node = nodeEl(container, c1.id);
    // Expanded: the editable body is present, not collapsed.
    expect(node).not.toHaveAttribute("data-collapsed");
    expect(within(node).queryByTestId("contention-body")).not.toBeNull();

    // Click the header -> collapses to a single horizontal bar.
    fireEvent.click(within(node).getByTestId("contention-header"));
    await waitFor(() =>
      expect(nodeEl(container, c1.id)).toHaveAttribute("data-collapsed", "true"),
    );
    expect(
      within(nodeEl(container, c1.id)).queryByTestId("contention-body"),
    ).toBeNull();

    // Click the bar (the header) again -> expands.
    fireEvent.click(within(nodeEl(container, c1.id)).getByTestId("contention-header"));
    await waitFor(() =>
      expect(nodeEl(container, c1.id)).not.toHaveAttribute("data-collapsed"),
    );
    expect(
      within(nodeEl(container, c1.id)).queryByTestId("contention-body"),
    ).not.toBeNull();

    await handle.close();
  });

  it("collapses a nested subpoint to a bar on header click and expands it", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);
    const s1 = addSubpoint(handle, c1.id);

    const { container, findByTestId } = render(
      <FlowSheetPanel handle={handle} />,
    );
    await findByTestId("subpoint-node");

    const subEl = () =>
      container.querySelector<HTMLElement>(
        `[data-testid="subpoint-node"][data-flow-node-id="${s1.id}"]`,
      )!;

    expect(subEl()).not.toHaveAttribute("data-collapsed");

    fireEvent.click(within(subEl()).getByTestId("subpoint-header"));
    await waitFor(() =>
      expect(subEl()).toHaveAttribute("data-collapsed", "true"),
    );

    fireEvent.click(within(subEl()).getByTestId("subpoint-header"));
    await waitFor(() =>
      expect(subEl()).not.toHaveAttribute("data-collapsed"),
    );

    await handle.close();
  });

  it("collapses all contentions except the active one via the button", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);

    const { container, findAllByTestId, getByTestId } = render(
      <FlowSheetPanel handle={handle} />,
    );
    await findAllByTestId("contention-node");

    // Make c1 the active node by interacting with its header, then re-expand it
    // (header click toggles collapse and marks the node active).
    fireEvent.click(within(nodeEl(container, c1.id)).getByTestId("contention-header"));
    fireEvent.click(within(nodeEl(container, c1.id)).getByTestId("contention-header"));
    await waitFor(() =>
      expect(nodeEl(container, c1.id)).not.toHaveAttribute("data-collapsed"),
    );

    fireEvent.click(getByTestId("collapse-all-except-active"));

    await waitFor(() =>
      expect(nodeEl(container, c2.id)).toHaveAttribute("data-collapsed", "true"),
    );
    expect(nodeEl(container, c1.id)).not.toHaveAttribute("data-collapsed");

    await handle.close();
  });

  it("clears activeNodeId when the active contention is removed", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);

    const { container, findAllByTestId, getByTestId } = render(
      <FlowSheetPanel handle={handle} />,
    );
    await findAllByTestId("contention-node");

    // Activate c1 by clicking its header (collapses it), then expand again.
    fireEvent.click(within(nodeEl(container, c1.id)).getByTestId("contention-header"));
    fireEvent.click(within(nodeEl(container, c1.id)).getByTestId("contention-header"));
    await waitFor(() =>
      expect(nodeEl(container, c1.id)).not.toHaveAttribute("data-collapsed"),
    );

    // Remove the active contention (c1) from the document.
    removeNode(handle, c1.id);
    await waitFor(() =>
      expect(
        container.querySelector(`[data-flow-node-id="${c1.id}"]`),
      ).toBeNull(),
    );

    // With c1 gone and activeNodeId cleared, "Collapse All Except Active"
    // should collapse c2 (not keep it open as if c1 were still active).
    fireEvent.click(getByTestId("collapse-all-except-active"));
    await waitFor(() =>
      expect(nodeEl(container, c2.id)).toHaveAttribute("data-collapsed", "true"),
    );

    await handle.close();
  });

  it("clears activeNodeId when the active subpoint is removed", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);
    const s1 = addSubpoint(handle, c1.id);

    const { container, findAllByTestId, getByTestId } = render(
      <FlowSheetPanel handle={handle} />,
    );
    await findAllByTestId("contention-node");

    // Activate s1 by clicking its header.
    const subEl = () =>
      container.querySelector<HTMLElement>(
        `[data-testid="subpoint-node"][data-flow-node-id="${s1.id}"]`,
      )!;
    fireEvent.click(within(subEl()).getByTestId("subpoint-header"));
    fireEvent.click(within(subEl()).getByTestId("subpoint-header"));
    await waitFor(() =>
      expect(subEl()).not.toHaveAttribute("data-collapsed"),
    );

    // Remove the active subpoint.
    removeSubpoint(handle, s1.id);
    await waitFor(() =>
      expect(
        container.querySelector(`[data-flow-node-id="${s1.id}"]`),
      ).toBeNull(),
    );

    // With s1 gone and activeNodeId cleared, both contentions collapse.
    fireEvent.click(getByTestId("collapse-all-except-active"));
    await waitFor(() =>
      expect(nodeEl(container, c1.id)).toHaveAttribute("data-collapsed", "true"),
    );
    expect(nodeEl(container, c2.id)).toHaveAttribute("data-collapsed", "true");

    await handle.close();
  });

  it("collapses all contentions except the active one via Ctrl+\\", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);

    const { container, findAllByTestId } = render(
      <FlowSheetPanel handle={handle} />,
    );
    await findAllByTestId("contention-node");

    // Activate c2.
    fireEvent.click(within(nodeEl(container, c2.id)).getByTestId("contention-header"));
    fireEvent.click(within(nodeEl(container, c2.id)).getByTestId("contention-header"));
    await waitFor(() =>
      expect(nodeEl(container, c2.id)).not.toHaveAttribute("data-collapsed"),
    );

    fireEvent.keyDown(document, { key: "\\", ctrlKey: true });

    await waitFor(() =>
      expect(nodeEl(container, c1.id)).toHaveAttribute("data-collapsed", "true"),
    );
    expect(nodeEl(container, c2.id)).not.toHaveAttribute("data-collapsed");

    await handle.close();
  });
});
