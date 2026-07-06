import { describe, it, expect } from "vitest";

import { FONT_SIZE_SCALE } from "../editor/marks";
import {
  FORMATTING_TARGET_KEYS,
  DEFAULT_FORMATTING_PROFILE,
  FONT_FAMILY_OPTIONS,
  type FormattingProfile,
  type FormattingTargetKey,
  type FormattingEntry,
} from "./profile";

/**
 * The formatting profile is the pure model of the product's evidence formatting
 * standards. These tests pin the *contract* - the target keys, the per-entry
 * shape (font/size/color plus the bold/underline style flags the standards
 * require), and the exact default values the standards specify - never any
 * rendering behaviour.
 */

describe("formatting target keys", () => {
  it("covers tag, cite, body, highlight, and unformatted in a stable order", () => {
    expect(FORMATTING_TARGET_KEYS).toEqual([
      "tag",
      "cite",
      "body",
      "highlight",
      "unformatted",
    ]);
  });
});

describe("DEFAULT_FORMATTING_PROFILE shape", () => {
  it("has exactly one entry per target key", () => {
    expect(Object.keys(DEFAULT_FORMATTING_PROFILE).sort()).toEqual(
      [...FORMATTING_TARGET_KEYS].sort(),
    );
  });

  it("gives every entry a font, size, color, and bold/underline flags", () => {
    for (const key of FORMATTING_TARGET_KEYS) {
      const entry: FormattingEntry = DEFAULT_FORMATTING_PROFILE[key];
      expect(typeof entry.fontFamily).toBe("string");
      expect(typeof entry.fontSize).toBe("string");
      expect(typeof entry.color).toBe("string");
      expect(typeof entry.bold).toBe("boolean");
      expect(typeof entry.underline).toBe("boolean");
    }
  });
});

describe("DEFAULT_FORMATTING_PROFILE values match the evidence standards exactly", () => {
  it("Tags: Calibri 13pt Bold", () => {
    expect(DEFAULT_FORMATTING_PROFILE.tag).toEqual({
      fontFamily: "Calibri",
      fontSize: "13pt",
      color: "#000000",
      bold: true,
      underline: false,
    });
  });

  it("Cite: Calibri 8pt", () => {
    expect(DEFAULT_FORMATTING_PROFILE.cite).toEqual({
      fontFamily: "Calibri",
      fontSize: "8pt",
      color: "#000000",
      bold: false,
      underline: false,
    });
  });

  it("Body: Calibri 12pt", () => {
    expect(DEFAULT_FORMATTING_PROFILE.body).toEqual({
      fontFamily: "Calibri",
      fontSize: "12pt",
      color: "#000000",
      bold: false,
      underline: false,
    });
  });

  it("Highlighted text: Calibri 12pt Underlined", () => {
    expect(DEFAULT_FORMATTING_PROFILE.highlight).toEqual({
      fontFamily: "Calibri",
      fontSize: "12pt",
      color: "#000000",
      bold: false,
      underline: true,
    });
  });

  it("Unformatted-shrink target: Calibri 8pt", () => {
    expect(DEFAULT_FORMATTING_PROFILE.unformatted).toEqual({
      fontFamily: "Calibri",
      fontSize: "8pt",
      color: "#000000",
      bold: false,
      underline: false,
    });
  });
});

describe("size model stays consistent with the shared font-size scale", () => {
  it("sizes are point strings in the same representation as the mark scale", () => {
    for (const key of FORMATTING_TARGET_KEYS) {
      expect(DEFAULT_FORMATTING_PROFILE[key].fontSize).toMatch(/^\d+pt$/);
    }
  });

  it("the unformatted-shrink target is the scale minimum (8pt)", () => {
    // The Shrink tool shrinks unformatted runs to the smallest scale step; the
    // standard's unformatted target must therefore equal that step, not drift
    // from the scale the tool cycles.
    expect(DEFAULT_FORMATTING_PROFILE.unformatted.fontSize).toBe(
      FONT_SIZE_SCALE[0],
    );
  });

  it("on-scale defaults (body/highlight/cite) are members of the mark scale", () => {
    for (const key of ["cite", "body", "highlight"] as FormattingTargetKey[]) {
      expect(FONT_SIZE_SCALE as readonly string[]).toContain(
        DEFAULT_FORMATTING_PROFILE[key].fontSize,
      );
    }
  });
});

describe("supporting metadata for a settings UI", () => {
  it("offers a font-family option list that includes the standard default", () => {
    expect(FONT_FAMILY_OPTIONS).toContain("Calibri");
    expect(FONT_FAMILY_OPTIONS.length).toBeGreaterThan(1);
  });

  it("the profile is a plain, mutation-safe record (clones do not alias)", () => {
    const copy: FormattingProfile = structuredClone(DEFAULT_FORMATTING_PROFILE);
    copy.body.fontSize = "10pt";
    expect(DEFAULT_FORMATTING_PROFILE.body.fontSize).toBe("12pt");
  });
});
