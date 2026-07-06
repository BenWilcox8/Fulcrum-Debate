// Pure presentational tests for the ToC row - no editor, no IndexedDB. The row
// renders one heading and reserves a leading-control slot a later feature (per-
// heading speech-doc checkboxes) fills without rewriting the row. Assertions are
// behavioral (rendered text / slot presence), never pixels.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import type { OutlineTreeNode } from "../editor/headings";
import { TocRow } from "./TocRow";

/** A leaf tree node for one heading. */
function node(overrides: Partial<OutlineTreeNode> = {}): OutlineTreeNode {
  return { level: 1, text: "AT: Gold", pos: 0, children: [], ...overrides };
}

describe("TocRow", () => {
  it("renders the heading's plain-text label", () => {
    render(<TocRow node={node({ text: "AT: Fusion" })} />);
    expect(screen.getByText("AT: Fusion")).toBeInTheDocument();
  });

  it("renders no leading control when none is passed", () => {
    render(<TocRow node={node()} />);
    expect(screen.queryByTestId("toc-row-leading")).toBeNull();
  });

  it("renders the leading control in its slot when one is passed", () => {
    render(
      <TocRow
        node={node()}
        leadingControl={<input type="checkbox" aria-label="include" />}
      />,
    );
    const slot = screen.getByTestId("toc-row-leading");
    expect(slot).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /include/i }),
    ).toBeInTheDocument();
    // The label still renders alongside the control.
    expect(screen.getByText("AT: Gold")).toBeInTheDocument();
  });

  it("is not marked active by default", () => {
    render(<TocRow node={node({ text: "Inactive" })} />);
    const row = screen.getByText("Inactive").closest("[data-active]");
    expect(row).toBeNull();
    expect(screen.getByText("Inactive").closest("[aria-current]")).toBeNull();
  });

  it("marks the row active when `active` is set", () => {
    render(<TocRow node={node({ text: "Active" })} active />);
    const label = screen.getByText("Active");
    const row = label.closest("[data-active='true']");
    expect(row).not.toBeNull();
    expect(row).toHaveAttribute("aria-current", "location");
  });
});
