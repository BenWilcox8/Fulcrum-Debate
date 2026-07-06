// Pure unit tests for the active-heading derivation - no editor, no IndexedDB,
// no layout. It maps a set of heading offsets and a scroll position to the
// single active heading `pos`.
import { describe, it, expect } from "vitest";

import {
  findActiveHeading,
  type HeadingOffset,
} from "./active-heading";

const offsets: HeadingOffset[] = [
  { pos: 1, top: 0 },
  { pos: 10, top: 100 },
  { pos: 20, top: 250 },
];

describe("findActiveHeading", () => {
  it("returns null when there are no headings", () => {
    expect(findActiveHeading([], 0)).toBeNull();
    expect(findActiveHeading([], 500)).toBeNull();
  });

  it("highlights the first heading when scrolled above all of them", () => {
    // Content before the first heading (preamble) reads as the topmost section.
    expect(findActiveHeading(offsets, -50)).toBe(1);
  });

  it("activates a heading exactly when it reaches the top", () => {
    expect(findActiveHeading(offsets, 100)).toBe(10);
    expect(findActiveHeading(offsets, 250)).toBe(20);
  });

  it("keeps the preceding heading active between two boundaries", () => {
    expect(findActiveHeading(offsets, 40)).toBe(1);
    expect(findActiveHeading(offsets, 150)).toBe(10);
    expect(findActiveHeading(offsets, 248)).toBe(10);
  });

  it("keeps the last heading active when scrolled past all of them", () => {
    expect(findActiveHeading(offsets, 9999)).toBe(20);
  });

  it("returns exactly one heading (never a set)", () => {
    const result = findActiveHeading(offsets, 150);
    expect(typeof result).toBe("number");
    expect([1, 10, 20]).toContain(result);
  });

  it("does not depend on the array being sorted", () => {
    const shuffled: HeadingOffset[] = [
      { pos: 20, top: 250 },
      { pos: 1, top: 0 },
      { pos: 10, top: 100 },
    ];
    expect(findActiveHeading(shuffled, 150)).toBe(10);
  });

  it("tolerates sub-pixel rounding at a boundary", () => {
    // A heading a hair short of the exact scroll position still activates.
    expect(findActiveHeading(offsets, 99.5)).toBe(10);
  });
});
