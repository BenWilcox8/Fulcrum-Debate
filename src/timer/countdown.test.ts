import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREP_SECONDS,
  formatTime,
  parseTime,
} from "./countdown";

describe("formatTime", () => {
  it("renders the prep default as 3:00", () => {
    expect(formatTime(DEFAULT_PREP_SECONDS)).toBe("3:00");
  });

  it("zero-pads seconds but not minutes", () => {
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(9)).toBe("0:09");
    expect(formatTime(600)).toBe("10:00");
  });

  it("clamps negatives and floors fractions to 0:00 and whole seconds", () => {
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(90.9)).toBe("1:30");
  });
});

describe("parseTime", () => {
  it("round-trips M:SS and MM:SS values", () => {
    expect(parseTime("3:00")).toBe(180);
    expect(parseTime("1:05")).toBe(65);
    expect(parseTime("10:00")).toBe(600);
  });

  it("accepts a bare number of seconds", () => {
    expect(parseTime("45")).toBe(45);
    expect(parseTime("  120 ")).toBe(120);
  });

  it("rejects unparseable input by returning null", () => {
    expect(parseTime("")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("1:2:3")).toBeNull();
    expect(parseTime("1:99")).toBeNull(); // seconds out of range
    expect(parseTime("1:aa")).toBeNull();
  });

  it("is the inverse of formatTime for produced values", () => {
    for (const seconds of [0, 9, 65, 180, 600]) {
      expect(parseTime(formatTime(seconds))).toBe(seconds);
    }
  });
});
