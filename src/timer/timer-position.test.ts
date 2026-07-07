import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMER_POSITION,
  clampFraction,
  clampTimerPosition,
  normalizeTimerPosition,
  timerOffsetPx,
  timerPositionFromPointer,
} from "./timer-position";

describe("timer-position model", () => {
  it("defaults to the top-right corner", () => {
    expect(DEFAULT_TIMER_POSITION).toEqual({ x: 1, y: 0 });
  });

  it("clamps a fraction into [0, 1] and defaults non-finite values", () => {
    expect(clampFraction(0.5, 1)).toBe(0.5);
    expect(clampFraction(-3, 1)).toBe(0);
    expect(clampFraction(4, 1)).toBe(1);
    expect(clampFraction(Number.NaN, 0.25)).toBe(0.25);
    expect(clampFraction(Infinity, 0.25)).toBe(0.25);
  });

  it("clamps both axes of a position", () => {
    expect(clampTimerPosition({ x: 2, y: -1 })).toEqual({ x: 1, y: 0 });
    expect(clampTimerPosition({ x: 0.3, y: 0.7 })).toEqual({ x: 0.3, y: 0.7 });
  });

  describe("normalizeTimerPosition", () => {
    it("passes through a valid position", () => {
      expect(normalizeTimerPosition({ x: 0.2, y: 0.8 })).toEqual({ x: 0.2, y: 0.8 });
    });

    it("clamps out-of-range axes", () => {
      expect(normalizeTimerPosition({ x: 5, y: -2 })).toEqual({ x: 1, y: 0 });
    });

    it("falls back field-by-field for missing/wrong-typed axes", () => {
      expect(normalizeTimerPosition({ x: 0.5 })).toEqual({ x: 0.5, y: 0 });
      expect(normalizeTimerPosition({ y: "nope" })).toEqual({ x: 1, y: 0 });
    });

    it("degrades a non-object to the default", () => {
      expect(normalizeTimerPosition(null)).toEqual(DEFAULT_TIMER_POSITION);
      expect(normalizeTimerPosition("garbage")).toEqual(DEFAULT_TIMER_POSITION);
      expect(normalizeTimerPosition(42)).toEqual(DEFAULT_TIMER_POSITION);
    });
  });

  describe("timerPositionFromPointer", () => {
    const container = { left: 0, top: 0, width: 1000, height: 800 };
    const card = { width: 200, height: 100 };
    const grab = { x: 20, y: 10 };

    it("maps a pointer to the fraction of the card's travel", () => {
      // Card top-left target = pointer - grab = (420, 210); travel = (800, 700).
      const pos = timerPositionFromPointer(container, card, grab, { x: 440, y: 220 });
      expect(pos.x).toBeCloseTo(420 / 800);
      expect(pos.y).toBeCloseTo(210 / 700);
    });

    it("clamps to [0, 1] when the pointer would push the card out of view", () => {
      expect(timerPositionFromPointer(container, card, grab, { x: -500, y: -500 })).toEqual({
        x: 0,
        y: 0,
      });
      expect(timerPositionFromPointer(container, card, grab, { x: 5000, y: 5000 })).toEqual({
        x: 1,
        y: 1,
      });
    });

    it("accounts for the container's origin offset", () => {
      const offsetContainer = { left: 100, top: 50, width: 1000, height: 800 };
      const pos = timerPositionFromPointer(offsetContainer, card, grab, {
        x: 540,
        y: 270,
      });
      // Local target = (540-100-20, 270-50-10) = (420, 210).
      expect(pos.x).toBeCloseTo(420 / 800);
      expect(pos.y).toBeCloseTo(210 / 700);
    });

    it("collapses an axis with no travel to 0", () => {
      const bigCard = { width: 1000, height: 800 };
      expect(timerPositionFromPointer(container, bigCard, grab, { x: 50, y: 50 })).toEqual({
        x: 0,
        y: 0,
      });
    });
  });

  describe("timerOffsetPx", () => {
    it("resolves a fraction to pixels across the available travel", () => {
      expect(
        timerOffsetPx({ x: 1, y: 0 }, { width: 1000, height: 800 }, { width: 200, height: 100 }),
      ).toEqual({ left: 800, top: 0 });
      expect(
        timerOffsetPx({ x: 0.5, y: 0.5 }, { width: 1000, height: 800 }, { width: 200, height: 100 }),
      ).toEqual({ left: 400, top: 350 });
    });

    it("never produces a negative offset when the card exceeds the container", () => {
      expect(
        timerOffsetPx({ x: 1, y: 1 }, { width: 100, height: 100 }, { width: 200, height: 200 }),
      ).toEqual({ left: 0, top: 0 });
    });

    it("round-trips with timerPositionFromPointer", () => {
      const container = { left: 0, top: 0, width: 1200, height: 900 };
      const card = { width: 240, height: 160 };
      const pos = timerPositionFromPointer(container, card, { x: 0, y: 0 }, { x: 300, y: 400 });
      const offset = timerOffsetPx(pos, container, card);
      expect(offset.left).toBeCloseTo(300);
      expect(offset.top).toBeCloseTo(400);
    });
  });
});
