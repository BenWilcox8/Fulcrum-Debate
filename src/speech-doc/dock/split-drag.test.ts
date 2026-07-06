import { describe, it, expect } from "vitest";

import { MAX_DOCK_SIZE, MIN_DOCK_SIZE } from "./dock-layout";
import { dockSizeFromPointer, type SplitRect } from "./split-drag";

const RECT: SplitRect = { left: 0, top: 0, width: 1000, height: 500 };

describe("dockSizeFromPointer", () => {
  it("side dock grows as the pointer moves left (toward the flow)", () => {
    // Pointer at x=700 → 300px of a 1000px container remains on the right.
    expect(dockSizeFromPointer(RECT, "side", 700, 0)).toBeCloseTo(0.3, 5);
    // Pointer at x=400 → 600px remains → dock = 60%.
    expect(dockSizeFromPointer(RECT, "side", 400, 0)).toBeCloseTo(0.6, 5);
  });

  it("bottom dock grows as the pointer moves up (toward the flow)", () => {
    // Pointer at y=350 → 150px of a 500px container remains below → 30%.
    expect(dockSizeFromPointer(RECT, "bottom", 0, 350)).toBeCloseTo(0.3, 5);
    expect(dockSizeFromPointer(RECT, "bottom", 0, 200)).toBeCloseTo(0.6, 5);
  });

  it("respects the container origin offset", () => {
    const offset: SplitRect = { left: 100, top: 50, width: 1000, height: 500 };
    // Right edge at x=1100; pointer at x=800 → 300 remains → 30%.
    expect(dockSizeFromPointer(offset, "side", 800, 0)).toBeCloseTo(0.3, 5);
  });

  it("clamps a drag past either extreme", () => {
    expect(dockSizeFromPointer(RECT, "side", 990, 0)).toBe(MIN_DOCK_SIZE);
    expect(dockSizeFromPointer(RECT, "side", 10, 0)).toBe(MAX_DOCK_SIZE);
  });

  it("falls back to the default fraction for a zero-extent container", () => {
    expect(dockSizeFromPointer({ ...RECT, width: 0 }, "side", 0, 0)).toBeCloseTo(
      0.4,
      5,
    );
    expect(
      dockSizeFromPointer({ ...RECT, height: 0 }, "bottom", 0, 0),
    ).toBeCloseTo(0.4, 5);
  });
});
