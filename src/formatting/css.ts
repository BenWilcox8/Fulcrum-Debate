/**
 * The pure formatting-profile -> CSS mapping: turns a {@link FormattingProfile}
 * into the scoped stylesheet that renders debate cards to the house standard.
 *
 * This is the *serialization* half of live card rendering (the reactive half -
 * reading the live profile and mounting the emitted CSS - lives in
 * {@link ./react | src/formatting/react}). Keeping it pure makes the rule set
 * directly testable ("rendered/serialized styles match the profile") and free of
 * React/Tiptap.
 *
 * ## How the profile targets map to selectors
 *
 * The {@link ../blockfile/card | card node model} ships **no CSS**, only stable
 * `data-card-region` hooks and the highlight `<mark>` element. This module keys
 * off exactly those hooks:
 *
 * | Target        | Selector                          | What it styles                     |
 * |---------------|-----------------------------------|------------------------------------|
 * | `tag`         | `[data-card-region="tag"]`        | the bracketed tactical-tag region  |
 * | `cite`        | `[data-card-region="cite"]`       | the citation line                  |
 * | `body`        | `[data-card-region="body"]`       | the prose body                     |
 * | (`tagline`)   | `[data-card-region="tagline"]`    | the tagline - **styled from the `body` entry**, since the profile has no separate tagline target (it inherits body per the slice-1 model) |
 * | `highlight`   | `mark`                            | highlighted (read-aloud) runs      |
 *
 * Every rule is scoped under a container selector (default
 * {@link DEFAULT_FORMATTING_SCOPE}, the `EditorContent` wrapper class the block
 * file uses) so the standard never leaks onto unrelated UI.
 *
 * ## Region rules carry the full entry; the highlight-mark rule does not
 *
 * A region is a *container*, so its rule emits the whole entry - family, size,
 * color, weight, decoration - as the default rendering for everything inside it.
 * An explicit inline font-size mark (a `textStyle` span, e.g. one the **Shrink**
 * tool applies) still wins over the region's stylesheet size, so region sizing is
 * a default the addressable marks override, never a fight.
 *
 * The highlight `<mark>` rule is deliberately narrower: it emits only
 * `font-family`, `color`, and the underline `text-decoration` from the
 * `highlight` entry. It **omits `font-size` and `font-weight`** on purpose -
 * those axes are owned by the addressable {@link ../editor/marks | font-size mark}
 * and the independent `bold` mark, and a highlighted run must stay independently
 * bold/sized (a bold+highlighted run renders bold). Emitting weight/size here
 * would clobber those marks, so the highlight rule contributes only the
 * treatment that has no competing mark - the underline that makes read-aloud text
 * read-aloud.
 */
import {
  type FormattingEntry,
  type FormattingProfile,
} from "./profile";

/**
 * The default scope selector rules are nested under: the class the block file's
 * `EditorContent` surface carries. A different editor surface passes its own.
 */
export const DEFAULT_FORMATTING_SCOPE = ".block-file-editor";

/** Options for {@link formattingProfileCss}. */
export interface FormattingCssOptions {
  /**
   * The container selector every rule is scoped under. Defaults to
   * {@link DEFAULT_FORMATTING_SCOPE}.
   */
  scope?: string;
}

/** `font-weight` value for an entry's bold flag. */
const weight = (bold: boolean): string => (bold ? "bold" : "normal");

/** `text-decoration` value for an entry's underline flag. */
const decoration = (underline: boolean): string =>
  underline ? "underline" : "none";

/**
 * The full declaration block for a *region* container: family, size, color,
 * weight, and decoration, so everything rendered inside the region defaults to
 * this entry.
 */
function regionDeclarations(entry: FormattingEntry): string {
  return [
    `font-family: ${entry.fontFamily}`,
    `font-size: ${entry.fontSize}`,
    `color: ${entry.color}`,
    `font-weight: ${weight(entry.bold)}`,
    `text-decoration: ${decoration(entry.underline)}`,
  ].join("; ");
}

/**
 * The narrower declaration block for the highlight `<mark>`: family, color, and
 * the underline treatment only. `font-size` and `font-weight` are intentionally
 * excluded (owned by the addressable font-size mark and the independent bold
 * mark, respectively) so a highlighted run stays independently sized and bold.
 */
function highlightMarkDeclarations(entry: FormattingEntry): string {
  return [
    `font-family: ${entry.fontFamily}`,
    `color: ${entry.color}`,
    `text-decoration: ${decoration(entry.underline)}`,
  ].join("; ");
}

/** One scoped CSS rule. */
function rule(scope: string, selector: string, declarations: string): string {
  return `${scope} ${selector} { ${declarations}; }`;
}

/**
 * Serializes a {@link FormattingProfile} into the scoped CSS that renders cards
 * to the profile. The output is a stylesheet string ready to drop into a
 * `<style>` element (see {@link ./react.CardFormattingStyles}).
 *
 * Regions (`tag`, `cite`, `body`, and the `tagline`, which rides the `body`
 * entry) get the full entry; the highlight `<mark>` gets the underline treatment
 * only. See the module doc for why.
 */
export function formattingProfileCss(
  profile: FormattingProfile,
  options: FormattingCssOptions = {},
): string {
  const scope = options.scope ?? DEFAULT_FORMATTING_SCOPE;

  return [
    rule(
      scope,
      '[data-card-region="tag"]',
      regionDeclarations(profile.tag),
    ),
    rule(
      scope,
      '[data-card-region="cite"]',
      regionDeclarations(profile.cite),
    ),
    rule(
      scope,
      '[data-card-region="body"]',
      regionDeclarations(profile.body),
    ),
    // The tagline has no separate target; it inherits body styling.
    rule(
      scope,
      '[data-card-region="tagline"]',
      regionDeclarations(profile.body),
    ),
    rule(scope, "mark", highlightMarkDeclarations(profile.highlight)),
  ].join("\n");
}
