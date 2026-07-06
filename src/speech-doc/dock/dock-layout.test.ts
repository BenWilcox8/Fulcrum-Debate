import { describe, it, expect } from "vitest";

import {
  DEFAULT_DOCK_LAYOUT,
  DOCK_POSITIONS,
  MAX_DOCK_SIZE,
  MIN_DOCK_SIZE,
  clampDockSize,
  normalizeDockLayout,
} from "./dock-layout";

describe("dock-layout model", () => {
  it("defaults to a side dock at a sensible fraction", () => {
    expect(DEFAULT_DOCK_LAYOUT.position).toBe("side");
    expect(DEFAULT_DOCK_LAYOUT.size).toBeGreaterThanOrEqual(MIN_DOCK_SIZE);
    expect(DEFAULT_DOCK_LAYOUT.size).toBeLessThanOrEqual(MAX_DOCK_SIZE);
  });

  it("exposes both dock positions in a stable order", () => {
    expect([...DOCK_POSITIONS]).toEqual(["side", "bottom"]);
  });

  describe("clampDockSize", () => {
    it("passes an in-range fraction through untouched", () => {
      expect(clampDockSize(0.5)).toBe(0.5);
    });

    it("clamps below the minimum up and above the maximum down", () => {
      expect(clampDockSize(0.01)).toBe(MIN_DOCK_SIZE);
      expect(clampDockSize(0.99)).toBe(MAX_DOCK_SIZE);
    });

    it("falls back to the default for a non-finite size", () => {
      expect(clampDockSize(Number.NaN)).toBe(DEFAULT_DOCK_LAYOUT.size);
      expect(clampDockSize(Number.POSITIVE_INFINITY)).toBe(
        DEFAULT_DOCK_LAYOUT.size,
      );
    });
  });

  describe("normalizeDockLayout", () => {
    it("keeps a valid layout, clamping its size", () => {
      expect(normalizeDockLayout({ position: "bottom", size: 0.3 })).toEqual({
        position: "bottom",
        size: 0.3,
      });
      expect(normalizeDockLayout({ position: "side", size: 5 })).toEqual({
        position: "side",
        size: MAX_DOCK_SIZE,
      });
    });

    it("falls back field-by-field for a malformed value", () => {
      expect(normalizeDockLayout({ position: "diagonal", size: 0.4 })).toEqual({
        position: DEFAULT_DOCK_LAYOUT.position,
        size: 0.4,
      });
      expect(normalizeDockLayout({ position: "bottom" })).toEqual({
        position: "bottom",
        size: DEFAULT_DOCK_LAYOUT.size,
      });
    });

    it("returns the default for a non-object", () => {
      expect(normalizeDockLayout(null)).toEqual(DEFAULT_DOCK_LAYOUT);
      expect(normalizeDockLayout("nonsense")).toEqual(DEFAULT_DOCK_LAYOUT);
      expect(normalizeDockLayout(42)).toEqual(DEFAULT_DOCK_LAYOUT);
    });
  });
});
