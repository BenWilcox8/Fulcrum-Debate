/**
 * Tests for the pure formatting-profile -> CSS mapping.
 *
 * The mapping is the serialization seam the live card renderer emits into a
 * `<style>` element: it turns a {@link FormattingProfile} into scoped CSS rules
 * keyed off the card model's `data-card-region` hooks and the highlight `<mark>`.
 * These tests pin that the emitted rules match the profile exactly (the
 * "rendered/serialized styles match the profile" acceptance), including the
 * deliberate exclusions on the highlight-mark rule.
 */
import { describe, it, expect } from "vitest";

import { formattingProfileCss } from "./css";
import { DEFAULT_FORMATTING_PROFILE, type FormattingProfile } from "./profile";

/** Extracts the single rule body for `selector` from a CSS string. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no rule for selector: ${selector}`);
  return match[1];
}

describe("formattingProfileCss", () => {
  it("scopes every rule under the default block-file editor scope", () => {
    const css = formattingProfileCss(DEFAULT_FORMATTING_PROFILE);
    // Every rule (there are several) is scoped; none leaks globally.
    const rules = css.match(/[^}]+\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).toContain(".block-file-editor");
    }
  });

  it("renders the tag region bold at 13pt from the standard profile", () => {
    const css = formattingProfileCss(DEFAULT_FORMATTING_PROFILE);
    const body = ruleBody(css, '.block-file-editor [data-card-region="tag"]');
    expect(body).toContain("font-family: Calibri");
    expect(body).toContain("font-size: 13pt");
    expect(body).toContain("color: #000000");
    expect(body).toContain("font-weight: bold");
    expect(body).toContain("text-decoration: none");
  });

  it("renders the cite region small (8pt), not bold", () => {
    const css = formattingProfileCss(DEFAULT_FORMATTING_PROFILE);
    const body = ruleBody(css, '.block-file-editor [data-card-region="cite"]');
    expect(body).toContain("font-size: 8pt");
    expect(body).toContain("font-weight: normal");
  });

  it("renders the body region at reading size (12pt)", () => {
    const css = formattingProfileCss(DEFAULT_FORMATTING_PROFILE);
    const body = ruleBody(css, '.block-file-editor [data-card-region="body"]');
    expect(body).toContain("font-size: 12pt");
    expect(body).toContain("font-weight: normal");
  });

  it("styles the tagline from the body entry (tagline inherits body)", () => {
    const css = formattingProfileCss(DEFAULT_FORMATTING_PROFILE);
    const body = ruleBody(
      css,
      '.block-file-editor [data-card-region="tagline"]',
    );
    // Same size as body, since tagline has no separate target and inherits body.
    expect(body).toContain("font-size: 12pt");
  });

  it("underlines the highlight mark and excludes font-size/weight from it", () => {
    const css = formattingProfileCss(DEFAULT_FORMATTING_PROFILE);
    const body = ruleBody(css, ".block-file-editor mark");
    expect(body).toContain("text-decoration: underline");
    expect(body).toContain("font-family: Calibri");
    expect(body).toContain("color: #000000");
    // Size stays owned by the addressable font-size mark; weight by the bold
    // mark. Emitting them here would fight those marks, so they are excluded.
    expect(body).not.toContain("font-size");
    expect(body).not.toContain("font-weight");
  });

  it("reflects a customized profile in the emitted rules", () => {
    const custom: FormattingProfile = {
      ...DEFAULT_FORMATTING_PROFILE,
      body: {
        fontFamily: "Georgia",
        fontSize: "14pt",
        color: "#112233",
        bold: true,
        underline: false,
      },
    };
    const css = formattingProfileCss(custom);
    const body = ruleBody(css, '.block-file-editor [data-card-region="body"]');
    expect(body).toContain("font-family: Georgia");
    expect(body).toContain("font-size: 14pt");
    expect(body).toContain("color: #112233");
    expect(body).toContain("font-weight: bold");
  });

  it("quotes multi-word font-family names so the CSS declaration is valid", () => {
    const custom: FormattingProfile = {
      ...DEFAULT_FORMATTING_PROFILE,
      body: {
        ...DEFAULT_FORMATTING_PROFILE.body,
        fontFamily: "Times New Roman",
      },
    };
    const css = formattingProfileCss(custom);
    const body = ruleBody(css, '.block-file-editor [data-card-region="body"]');
    expect(body).toContain('font-family: "Times New Roman"');
    expect(body).not.toContain("font-family: Times New Roman;");
  });

  it("honors a custom scope", () => {
    const css = formattingProfileCss(DEFAULT_FORMATTING_PROFILE, {
      scope: ".speech-doc",
    });
    expect(css).toContain('.speech-doc [data-card-region="tag"]');
    expect(css).not.toContain(".block-file-editor");
  });
});
