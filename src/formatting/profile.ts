/**
 * The evidence **formatting profile**: the pure model of the product's debate
 * formatting standards.
 *
 * A debater's evidence is expected to render to a fixed house style - tags in
 * one weight and size, citations small, body text at reading size, highlighted
 * (read-aloud) text underlined, and everything the debater did *not* highlight
 * shrunk to a small "unformatted" size so the eye skips it. This module encodes
 * that standard as data so the rest of the feature can *read* it rather than
 * hard-code it:
 *
 * - live card rendering applies each entry's font/size/color/weight to the
 *   matching card region (and to highlighted vs. unformatted runs in the body),
 * - the **Shrink** tool drives unformatted runs down to the {@link ./profile
 *   unformatted} target,
 * - the Settings panel renders editable controls straight from this shape.
 *
 * This slice is **model only** - no rendering, no Tiptap, no React. The
 * {@link ./preferences | preferences section} makes the profile editable and
 * persisted; sibling slices consume it.
 *
 * ## Targets: card regions *and* mark states
 *
 * A profile is keyed by {@link FormattingTargetKey} - five *formatting targets*
 * that mix card anatomy with mark state:
 *
 * - `tag`, `cite`, `body` line up with the like-named
 *   {@link ../blockfile/card-unit | card regions} (the fourth region, `tagline`,
 *   inherits body styling and is not a separately-standardised target in this
 *   slice).
 * - `highlight` is not a region but a *mark state*: how a run inside the body
 *   that carries the highlight mark should read (underlined, at reading size).
 * - `unformatted` is the other body mark state: the small size an un-highlighted
 *   run is shrunk to. It is the Shrink tool's target.
 *
 * Keeping all five in one profile lets a single editable/persisted object drive
 * every formatting decision.
 *
 * ## Sizes are point strings, consistent with the mark scale
 *
 * {@link FormattingEntry.fontSize} is a CSS **point string** (`"12pt"`), the
 * exact representation the {@link ../editor/marks | font-size mark} stores in its
 * `fontSize` attribute, so a rendered size drops straight onto the mark with no
 * conversion. The on-scale sizes here (8/12pt) are members of `FONT_SIZE_SCALE`,
 * and the `unformatted` target is deliberately the scale *minimum* - the step the
 * Shrink tool cycles to - so the standard cannot drift away from the scale the
 * tool shares. Tags at `13pt` are an off-scale fixed size (a set style, not a
 * Shrink step): the field is a free point string rather than the closed
 * `FontSize` union so a legitimate off-scale standard is expressible and any size
 * remains user-editable.
 */

/**
 * One formatting target: the three standardised card regions plus the two body
 * mark states (`highlight` / `unformatted`).
 */
export type FormattingTargetKey =
  | "tag"
  | "cite"
  | "body"
  | "highlight"
  | "unformatted";

/**
 * The formatting targets in a stable order (used to render the settings UI and
 * to iterate the profile deterministically).
 */
export const FORMATTING_TARGET_KEYS: readonly FormattingTargetKey[] = [
  "tag",
  "cite",
  "body",
  "highlight",
  "unformatted",
] as const;

/**
 * The formatting applied to one target: a font family, a size, a text color, and
 * the two style flags the standards need (`bold` for tags, `underline` for
 * highlighted text). All five are independently editable so the whole house
 * style is customisable.
 */
export interface FormattingEntry {
  /** Font family name (e.g. `"Calibri"`). */
  fontFamily: string;
  /** Size as a CSS point string (e.g. `"12pt"`), matching the font-size mark. */
  fontSize: string;
  /** Text color as a CSS color string (e.g. `"#000000"`). */
  color: string;
  /** Whether the target renders bold. */
  bold: boolean;
  /** Whether the target renders underlined. */
  underline: boolean;
}

/** A complete formatting profile: one {@link FormattingEntry} per target. */
export type FormattingProfile = Record<FormattingTargetKey, FormattingEntry>;

/** The house text color for every standard entry (plain black). */
const STANDARD_COLOR = "#000000";

/**
 * The default evidence formatting standards, encoded exactly:
 *
 * | Target       | Font    | Size | Style      |
 * |--------------|---------|------|------------|
 * | Tag          | Calibri | 13pt | Bold       |
 * | Cite         | Calibri | 8pt  | -          |
 * | Body         | Calibri | 12pt | -          |
 * | Highlighted  | Calibri | 12pt | Underlined |
 * | Unformatted  | Calibri | 8pt  | -          |
 *
 * `unformatted` doubles as the Shrink tool's target size (the scale minimum).
 */
export const DEFAULT_FORMATTING_PROFILE: FormattingProfile = {
  tag: {
    fontFamily: "Calibri",
    fontSize: "13pt",
    color: STANDARD_COLOR,
    bold: true,
    underline: false,
  },
  cite: {
    fontFamily: "Calibri",
    fontSize: "8pt",
    color: STANDARD_COLOR,
    bold: false,
    underline: false,
  },
  body: {
    fontFamily: "Calibri",
    fontSize: "12pt",
    color: STANDARD_COLOR,
    bold: false,
    underline: false,
  },
  highlight: {
    fontFamily: "Calibri",
    fontSize: "12pt",
    color: STANDARD_COLOR,
    bold: false,
    underline: true,
  },
  unformatted: {
    fontFamily: "Calibri",
    fontSize: "8pt",
    color: STANDARD_COLOR,
    bold: false,
    underline: false,
  },
};

/**
 * Human-facing labels for each target, for the settings UI. Kept beside the
 * targets so the panel slice needs no parallel table.
 */
export const FORMATTING_TARGET_LABELS: Record<FormattingTargetKey, string> = {
  tag: "Tag",
  cite: "Cite",
  body: "Body",
  highlight: "Highlighted text",
  unformatted: "Unformatted text",
};

/**
 * A reasonable set of font families the settings UI can offer for the font
 * control. The standard default (`"Calibri"`) is first. This is presentation
 * metadata, not a constraint on {@link FormattingEntry.fontFamily} - a user may
 * type any family name.
 */
export const FONT_FAMILY_OPTIONS: readonly string[] = [
  "Calibri",
  "Times New Roman",
  "Arial",
  "Georgia",
  "Cambria",
  "Verdana",
] as const;
