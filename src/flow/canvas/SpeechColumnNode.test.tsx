import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";

import { SpeechColumnNode } from "./SpeechColumnNode";
import type { SpeechColumnNode as SpeechColumnNodeType } from "./column-nodes";

/**
 * Renders the node with just the `data` it reads. XYFlow passes a large
 * `NodeProps` object; the component only depends on `data`, so a minimal cast
 * exercises the real render path without the full XYFlow surface.
 */
const renderNode = (data: SpeechColumnNodeType["data"]) =>
  render(<SpeechColumnNode {...({ data } as unknown as NodeProps<SpeechColumnNodeType>)} />);

describe("SpeechColumnNode", () => {
  it("shows the column label", () => {
    renderNode({ label: "1AC", side: "aff" });
    expect(screen.getByText("1AC")).toBeInTheDocument();
  });

  it("colours an aff column with the aff design tokens", () => {
    renderNode({ label: "1AC", side: "aff" });
    const column = screen.getByTestId("speech-column");
    expect(column).toHaveAttribute("data-side", "aff");
    expect(column.className).toContain("bg-aff-soft");
    expect(column.className).toContain("border-aff-strong");
    // No raw palette / hex colouring leaks in.
    expect(column.className).not.toMatch(/neg/);
  });

  it("colours a neg column with the neg design tokens", () => {
    renderNode({ label: "1NC", side: "neg" });
    const column = screen.getByTestId("speech-column");
    expect(column).toHaveAttribute("data-side", "neg");
    expect(column.className).toContain("bg-neg-soft");
    expect(column.className).toContain("border-neg-strong");
    expect(column.className).not.toMatch(/aff/);
  });

  it("aff and neg columns are visibly distinct", () => {
    const { container: affContainer } = renderNode({ label: "1AC", side: "aff" });
    const { container: negContainer } = renderNode({ label: "1NC", side: "neg" });
    const aff = affContainer.querySelector("[data-testid=speech-column]")!;
    const neg = negContainer.querySelector("[data-testid=speech-column]")!;
    expect(aff.className).not.toEqual(neg.className);
  });

  it("keeps pointer events enabled so the click-to-activate handler fires", () => {
    // XYFlow gives a non-selectable, non-draggable node wrapper
    // `pointer-events: none`; without an explicit `pointer-events-auto` the
    // column's onClick never fires in a real browser and no active column can
    // be chosen (the C# trigger then has nowhere to land). This class is the
    // guard for that interaction - jsdom has no layout so only its presence is
    // assertable here; the behaviour was verified in the browser.
    renderNode({ label: "1AC", side: "aff" });
    expect(screen.getByTestId("speech-column").className).toContain(
      "pointer-events-auto",
    );
  });

  it("exposes an empty body region as the seam for future flow nodes", () => {
    const { container } = renderNode({ label: "1AC", side: "aff" });
    const body = container.querySelector("[data-column-body]");
    expect(body).not.toBeNull();
    expect(body?.childElementCount).toBe(0);
  });
});
