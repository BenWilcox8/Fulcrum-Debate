import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { MAX_DOCK_SIZE } from "./dock-layout";
import { SplitDock } from "./SplitDock";

function renderSplit(
  position: "side" | "bottom",
  size = 0.4,
  onSizeChange = vi.fn(),
) {
  const view = render(
    <SplitDock
      position={position}
      size={size}
      onSizeChange={onSizeChange}
      primary={<div data-testid="primary">flow</div>}
      secondary={<div data-testid="secondary">speech</div>}
    />,
  );
  return { view, onSizeChange };
}

describe("SplitDock", () => {
  it("renders both panes", () => {
    const { view } = renderSplit("side");
    expect(view.getByTestId("primary").textContent).toBe("flow");
    expect(view.getByTestId("secondary").textContent).toBe("speech");
  });

  it("lays out as a vertical split (flex-row) when side-docked", () => {
    const { view } = renderSplit("side");
    const container = view.getByTestId("split-dock");
    expect(container.getAttribute("data-dock-position")).toBe("side");
    expect(container.className).toContain("flex-row");
    expect(view.getByRole("separator").getAttribute("aria-orientation")).toBe(
      "vertical",
    );
  });

  it("lays out as a horizontal split (flex-col) when bottom-docked", () => {
    const { view } = renderSplit("bottom");
    const container = view.getByTestId("split-dock");
    expect(container.getAttribute("data-dock-position")).toBe("bottom");
    expect(container.className).toContain("flex-col");
    expect(view.getByRole("separator").getAttribute("aria-orientation")).toBe(
      "horizontal",
    );
  });

  it("reports the current size on the separator", () => {
    const { view } = renderSplit("side", 0.4);
    expect(view.getByRole("separator").getAttribute("aria-valuenow")).toBe("40");
  });

  it("resizes with the arrow keys (keyboard-operable divider)", () => {
    const { view, onSizeChange } = renderSplit("side", 0.4);
    const separator = view.getByRole("separator");

    // Left/Up grows the dock toward the flow edge.
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(onSizeChange).toHaveBeenLastCalledWith(expect.any(Number));
    expect(onSizeChange.mock.calls[0][0]).toBeGreaterThan(0.4);

    // Right/Down shrinks it.
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onSizeChange.mock.calls[1][0]).toBeLessThan(0.4);
  });

  it("clamps a keyboard nudge at the maximum", () => {
    const { view, onSizeChange } = renderSplit("side", MAX_DOCK_SIZE);
    fireEvent.keyDown(view.getByRole("separator"), { key: "ArrowUp" });
    expect(onSizeChange).toHaveBeenLastCalledWith(MAX_DOCK_SIZE);
  });

  it("ignores non-arrow keys", () => {
    const { view, onSizeChange } = renderSplit("side");
    fireEvent.keyDown(view.getByRole("separator"), { key: "Enter" });
    expect(onSizeChange).not.toHaveBeenCalled();
  });
});
