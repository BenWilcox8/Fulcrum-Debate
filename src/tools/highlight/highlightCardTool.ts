/**
 * The Highlight card-cutting tool - the first real tool on the toolbar
 * framework, and the base the Extract Highlight follow-up builds on.
 *
 * Highlighting is the debater's core gesture: it marks the words actually read
 * aloud out of a longer card, so a highlighted run is meaningful document data
 * (which the Extract tool later slices out), not mere emphasis. The tool toggles
 * the shared {@link ../../editor/marks.HighlightMark | highlight mark} on the
 * active selection through the conventional command API
 * (`editor.commands.toggleHighlight()`), so highlighted runs stay queryable by
 * mark type. Because highlight and bold are separate ProseMirror marks, applying
 * or removing the highlight never disturbs bold (and vice versa) - a run can be
 * read-aloud, emphasised, or both.
 *
 * ## Color is a live *render* preference, not a per-run mark attribute
 *
 * The highlight mark is single-color by design (`multicolor: false`; see the
 * mark's docblock) - it is a boolean "read this aloud" flag, and the document
 * JSON stays attribute-free. The configurable **color** is therefore a global
 * rendering choice, declared here as the tool's one setting and applied via CSS
 * (see {@link highlightColorCss} and `../react/HighlightStyles`), *not* baked
 * into each run. This keeps the schema stable, keeps `applyToSelection` a plain
 * mark toggle, and makes a color change reflect live on *every* highlighted run
 * at once - including ones highlighted before the change. Offering the color as
 * an enumerated palette ({@link HIGHLIGHT_COLORS}) lets the schema-generated
 * Settings panel render it as a select with no bespoke control.
 */
import type { Editor } from "@tiptap/core";

import type { PreferenceField } from "../../preferences";
import type { CardToolDefinition } from "../registry";

/**
 * The highlighter palette offered in the tool's settings. Each entry is a valid
 * CSS color that doubles as its own human-readable label, so the schema-driven
 * Settings select reads naturally ("yellow", "cyan", ...) and the value drops
 * straight into the emitted `background-color`.
 */
export const HIGHLIGHT_COLORS = [
  "yellow",
  "cyan",
  "lime",
  "pink",
  "orange",
] as const;

/** The default highlighter color: the classic yellow highlighter. */
export const DEFAULT_HIGHLIGHT_COLOR = "yellow";

/**
 * The default scope the highlight-color rule is nested under: the block file's
 * `EditorContent` surface class, matching the formatting stylesheet's scope so
 * the highlighter color never leaks onto unrelated UI.
 *
 * Intentionally mirrors `DEFAULT_FORMATTING_SCOPE` in `src/formatting/css.ts`
 * (a cross-module import to share one string would be worse coupling than the
 * duplication). Keep the two in sync if the class name ever changes.
 */
export const HIGHLIGHT_TOOL_SCOPE = ".block-file-editor";

/**
 * The Highlight tool's settings schema: one enumerated color field. A `type`
 * alias (not an `interface`) so it satisfies the `SectionSchema`
 * `Record<string, PreferenceField<unknown>>` index-signature constraint.
 */
export type HighlightToolSettings = {
  /** The highlighter color, one of {@link HIGHLIGHT_COLORS}. */
  color: PreferenceField<string>;
};

/**
 * Serializes the highlighter `color` into the scoped CSS that paints highlighted
 * `<mark>` runs. It sets **only** `background-color`, the axis the formatting
 * profile's `mark` rule deliberately leaves unclaimed (that rule owns the text
 * color, underline, and family), so the two stylesheets compose without a fight.
 */
export function highlightColorCss(
  color: string,
  scope: string = HIGHLIGHT_TOOL_SCOPE,
): string {
  const safeColor = (HIGHLIGHT_COLORS as readonly string[]).includes(color)
    ? color
    : DEFAULT_HIGHLIGHT_COLOR;
  return `${scope} mark { background-color: ${safeColor}; }`;
}

/**
 * The Highlight card-cutting tool. Toggles the `highlight` mark on the editor's
 * current selection - adding it to an un-highlighted run, removing it from a
 * highlighted one - and returns whether the document changed (the truthiness a
 * Tiptap command chain returns). The `color` setting drives rendering, not the
 * mark, so it is intentionally not read here.
 */
export const highlightCardTool: CardToolDefinition<HighlightToolSettings> = {
  id: "highlight",
  label: "Highlight",
  description:
    "Marks the words read aloud out of a card. Toggles the highlight mark on " +
    "the selection; the highlighter color is configurable and applies live.",
  settings: {
    color: {
      // Widened to `string` (the store-core convention) so it can be set to
      // another palette value.
      default: DEFAULT_HIGHLIGHT_COLOR as string,
      label: "Highlight color",
      description: "The highlighter color applied to read-aloud text.",
      options: HIGHLIGHT_COLORS,
    },
  },
  applyToSelection(editor: Editor): boolean {
    return editor.chain().focus().toggleHighlight().run();
  },
};
