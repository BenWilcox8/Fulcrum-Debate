/**
 * Tests for the HTML->RTF conversion the SpeechDrop target uses to preserve
 * formatting. They drive the known editor HTML subset (headings, paragraphs,
 * bold/underline/highlight) and assert the RTF encodes it, escapes RTF
 * metacharacters, and never drops content.
 */
import { describe, expect, it } from "vitest";

import { htmlToRtf } from "./rtf";

describe("htmlToRtf", () => {
  it("wraps output in an RTF document with a font and color table", () => {
    const rtf = htmlToRtf("<p>Hello</p>");
    expect(rtf.startsWith("{\\rtf1")).toBe(true);
    expect(rtf.endsWith("}")).toBe(true);
    expect(rtf).toContain("\\fonttbl");
    expect(rtf).toContain("\\colortbl");
    expect(rtf).toContain("Hello");
  });

  it("renders a paragraph as its own \\par block", () => {
    const rtf = htmlToRtf("<p>One</p><p>Two</p>");
    // Count paragraph terminators (`\par\n`), not `\pard` resets.
    const pars = rtf.match(/\\par\n/g) ?? [];
    expect(pars.length).toBe(2);
    expect(rtf.indexOf("One")).toBeLessThan(rtf.indexOf("Two"));
  });

  it("preserves bold as \\b", () => {
    const rtf = htmlToRtf("<p><strong>Tagline</strong></p>");
    expect(rtf).toContain("\\b ");
    expect(rtf).toContain("Tagline");
    expect(rtf).toContain("\\b0");
  });

  it("preserves underline and highlight", () => {
    const rtf = htmlToRtf("<p><u>u</u><mark>m</mark></p>");
    expect(rtf).toContain("\\ul ");
    expect(rtf).toContain("\\ulnone");
    expect(rtf).toContain("\\highlight1 ");
    expect(rtf).toContain("\\highlight0");
  });

  it("renders headings as bold, larger paragraphs", () => {
    const rtf = htmlToRtf("<h1>Title</h1>");
    expect(rtf).toContain("\\fs36");
    expect(rtf).toContain("\\b ");
    expect(rtf).toContain("Title");
  });

  it("escapes RTF metacharacters", () => {
    const rtf = htmlToRtf("<p>a{b}c\\d</p>");
    expect(rtf).toContain("a\\{b\\}c\\\\d");
  });

  it("escapes non-ASCII characters as \\u escapes", () => {
    const rtf = htmlToRtf("<p>café</p>"); // café
    expect(rtf).toContain("caf\\u233?");
  });

  it("keeps text from an unknown element rather than dropping it", () => {
    const rtf = htmlToRtf("<p><span>kept</span></p>");
    expect(rtf).toContain("kept");
  });

  it("groups loose top-level text into a paragraph", () => {
    const rtf = htmlToRtf("loose text");
    expect(rtf).toContain("loose text");
    expect(rtf).toContain("\\par");
  });

  it("handles the full document wrapper payload assembly produces", () => {
    const html =
      "<!doctype html><html><head></head><body><h1>Speech</h1>" +
      "<p><strong>Tag</strong> body</p></body></html>";
    const rtf = htmlToRtf(html);
    expect(rtf).toContain("Speech");
    expect(rtf).toContain("Tag");
    expect(rtf).toContain("body");
    expect(rtf).toContain("\\b ");
  });
});
