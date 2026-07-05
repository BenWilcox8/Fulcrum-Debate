// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the established document-layer test
// pattern). These tests drive the column-management controls over a *real*
// flow-sheet handle - no mocks - and assert the write path lands in the model
// and survives a reload through a genuinely fresh handle.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { listColumns } from "../columns";
import { ColumnControls } from "./ColumnControls";

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

/** Adds a column through the UI: pick a side, type a label, submit. */
const addViaUi = (side: "Aff" | "Neg", label: string) => {
  fireEvent.click(screen.getByRole("button", { name: side }));
  fireEvent.change(screen.getByLabelText("New column label"), {
    target: { value: label },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add column" }));
};

describe("ColumnControls", () => {
  it("adds a column with the chosen side and clears the input", async () => {
    const handle = await openFlowSheet();
    render(<ColumnControls handle={handle} />);

    addViaUi("Neg", "1NC");

    await waitFor(() => expect(listColumns(handle)).toHaveLength(1));
    expect(listColumns(handle)[0]).toMatchObject({ label: "1NC", side: "neg" });
    // A row surfaces for the new column and the add input is cleared.
    expect(screen.getByTestId("column-row")).toHaveAttribute("data-side", "neg");
    expect(screen.getByLabelText("New column label")).toHaveValue("");
  });

  it("does not add a blank label", async () => {
    const handle = await openFlowSheet();
    render(<ColumnControls handle={handle} />);

    fireEvent.change(screen.getByLabelText("New column label"), {
      target: { value: "   " },
    });
    // Submit button stays disabled for whitespace-only input.
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
    expect(listColumns(handle)).toHaveLength(0);
  });

  it("relabels a column inline on commit", async () => {
    const handle = await openFlowSheet();
    render(<ColumnControls handle={handle} />);
    addViaUi("Aff", "1AC");

    const row = await screen.findByTestId("column-row");
    const labelInput = within(row).getByLabelText("Label for 1AC");
    fireEvent.change(labelInput, { target: { value: "1AC (rebuild)" } });
    fireEvent.keyDown(labelInput, { key: "Enter" });

    await waitFor(() =>
      expect(listColumns(handle)[0].label).toBe("1AC (rebuild)"),
    );
  });

  it("commits an inline relabel on blur too", async () => {
    const handle = await openFlowSheet();
    render(<ColumnControls handle={handle} />);
    addViaUi("Aff", "1AC");

    const row = await screen.findByTestId("column-row");
    const labelInput = within(row).getByLabelText("Label for 1AC");
    fireEvent.change(labelInput, { target: { value: "2AC" } });
    fireEvent.blur(labelInput);

    await waitFor(() => expect(listColumns(handle)[0].label).toBe("2AC"));
  });

  it("reorders columns with the move buttons", async () => {
    const handle = await openFlowSheet();
    render(<ColumnControls handle={handle} />);
    addViaUi("Aff", "1AC");
    addViaUi("Neg", "1NC");

    await waitFor(() =>
      expect(screen.getAllByTestId("column-row")).toHaveLength(2),
    );
    // Move the second column (1NC) left, ahead of 1AC.
    fireEvent.click(screen.getByRole("button", { name: "Move 1NC left" }));

    await waitFor(() =>
      expect(listColumns(handle).map((c) => c.label)).toEqual(["1NC", "1AC"]),
    );
  });

  it("removes a column", async () => {
    const handle = await openFlowSheet();
    render(<ColumnControls handle={handle} />);
    addViaUi("Aff", "1AC");

    await screen.findByTestId("column-row");
    fireEvent.click(screen.getByRole("button", { name: "Remove 1AC" }));

    await waitFor(() => expect(listColumns(handle)).toHaveLength(0));
  });

  it("renders an empty, add-disabled strip for a null handle", () => {
    render(<ColumnControls handle={null} />);
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
    expect(screen.queryByTestId("column-row")).toBeNull();
  });

  it("persists add / relabel / reorder through a fresh handle reload", async () => {
    const id = uniqueId();
    const handle = await openFlowSheet(id);
    const { unmount } = render(<ColumnControls handle={handle} />);

    addViaUi("Aff", "1AC");
    addViaUi("Neg", "1NC");
    await waitFor(() =>
      expect(screen.getAllByTestId("column-row")).toHaveLength(2),
    );

    // Relabel the first, then move the second ahead of it.
    const firstRow = screen.getAllByTestId("column-row")[0];
    const firstInput = within(firstRow).getByLabelText("Label for 1AC");
    fireEvent.change(firstInput, { target: { value: "1AC v2" } });
    fireEvent.keyDown(firstInput, { key: "Enter" });
    await waitFor(() => expect(listColumns(handle)[0].label).toBe("1AC v2"));

    fireEvent.click(screen.getByRole("button", { name: "Move 1NC left" }));
    await waitFor(() =>
      expect(listColumns(handle).map((c) => c.label)).toEqual(["1NC", "1AC v2"]),
    );

    // Close everything and reopen the same id from a genuinely fresh handle.
    unmount();
    await handle.close();

    const reopened = await openFlowSheet(id);
    const persisted = listColumns(reopened);
    expect(persisted.map((c) => c.label)).toEqual(["1NC", "1AC v2"]);
    expect(persisted.map((c) => c.side)).toEqual(["neg", "aff"]);
    await reopened.close();
  });
});
