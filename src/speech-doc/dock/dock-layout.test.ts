import { describe, it, expect } from "vitest";

import {
  DEFAULT_DOCK_LAYOUT,
  DEFAULT_DOCK_SIZES,
  DOCK_POSITIONS,
  FALLBACK_DOCK_SIZE,
  MAX_DOCK_SIZE,
  MIN_DOCK_SIZE,
  clampDockSize,
  dockSizeFor,
  normalizeDockLayout,
} from "./dock-layout";

describe("dock-layout model", () => {
  it("defaults to a side dock at a sensible fraction", () => {
    expect(DEFAULT_DOCK_LAYOUT.position).toBe("side");
    expect(dockSizeFor(DEFAULT_DOCK_LAYOUT)).toBeGreaterThanOrEqual(MIN_DOCK_SIZE);
    expect(dockSizeFor(DEFAULT_DOCK_LAYOUT)).toBeLessThanOrEqual(MAX_DOCK_SIZE);
  });

  it("defaults the bottom edge to a shorter fraction than the side edge", () => {
    // A 40% side width is comfortable, but 40% of the height leaves the flow too
    // short - so the bottom edge defaults lower, giving the flow more height.
    expect(DEFAULT_DOCK_SIZES.bottom).toBeLessThan(DEFAULT_DOCK_SIZES.side);
    expect(DEFAULT_DOCK_SIZES.bottom).toBeGreaterThanOrEqual(MIN_DOCK_SIZE);
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

    it("falls back to a valid mid-range fraction for a non-finite size", () => {
      expect(clampDockSize(Number.NaN)).toBe(FALLBACK_DOCK_SIZE);
      expect(clampDockSize(Number.POSITIVE_INFINITY)).toBe(FALLBACK_DOCK_SIZE);
    });
  });

  describe("dockSizeFor", () => {
    it("reads the clamped size for the layout's current edge", () => {
      const layout = {
        position: "bottom" as const,
        sizes: { side: 0.4, bottom: 0.25 },
      };
      expect(dockSizeFor(layout)).toBe(0.25);
      // An explicit position peeks at the other edge's size.
      expect(dockSizeFor(layout, "side")).toBe(0.4);
    });

    it("clamps an out-of-range stored size on read", () => {
      const layout = {
        position: "side" as const,
        sizes: { side: 5, bottom: 0.3 },
      };
      expect(dockSizeFor(layout)).toBe(MAX_DOCK_SIZE);
    });
  });

  describe("normalizeDockLayout", () => {
    it("keeps a valid per-edge layout, clamping each size", () => {
      expect(
        normalizeDockLayout({
          position: "bottom",
          sizes: { side: 0.4, bottom: 0.3 },
        }),
      ).toEqual({ position: "bottom", sizes: { side: 0.4, bottom: 0.3 } });
      expect(
        normalizeDockLayout({
          position: "side",
          sizes: { side: 5, bottom: 0.3 },
        }),
      ).toEqual({ position: "side", sizes: { side: MAX_DOCK_SIZE, bottom: 0.3 } });
    });

    it("migrates a legacy single-size shape onto its stored edge", () => {
      expect(normalizeDockLayout({ position: "bottom", size: 0.5 })).toEqual({
        position: "bottom",
        sizes: { side: DEFAULT_DOCK_SIZES.side, bottom: 0.5 },
      });
      expect(normalizeDockLayout({ position: "side", size: 0.6 })).toEqual({
        position: "side",
        sizes: { side: 0.6, bottom: DEFAULT_DOCK_SIZES.bottom },
      });
    });

    it("falls back field-by-field for a malformed value", () => {
      expect(
        normalizeDockLayout({ position: "diagonal", sizes: { side: 0.4, bottom: 0.3 } }),
      ).toEqual({
        position: DEFAULT_DOCK_LAYOUT.position,
        sizes: { side: 0.4, bottom: 0.3 },
      });
      expect(normalizeDockLayout({ position: "bottom" })).toEqual({
        position: "bottom",
        sizes: { ...DEFAULT_DOCK_SIZES },
      });
      // A partial sizes map fills the missing edge from the default.
      expect(
        normalizeDockLayout({ position: "side", sizes: { side: 0.55 } }),
      ).toEqual({
        position: "side",
        sizes: { side: 0.55, bottom: DEFAULT_DOCK_SIZES.bottom },
      });
    });

    it("returns the default for a non-object", () => {
      expect(normalizeDockLayout(null)).toEqual(DEFAULT_DOCK_LAYOUT);
      expect(normalizeDockLayout("nonsense")).toEqual(DEFAULT_DOCK_LAYOUT);
      expect(normalizeDockLayout(42)).toEqual(DEFAULT_DOCK_LAYOUT);
    });
  });
});
