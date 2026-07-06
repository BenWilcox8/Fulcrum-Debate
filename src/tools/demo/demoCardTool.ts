/**
 * The demo card tool - the reference tool that proves the card-cutting toolbar
 * seam end-to-end without shipping a real tool (Extract, Shrink, Condense, Auto
 * Speech, Send to Block File all land in later slices). It is the toolbar's
 * counterpart to the `src/settings/demo` reference contribution: a real,
 * registered tool with a settings schema and an apply-to-selection operation, so
 * the toolbar container renders a working button and the whole seam (register →
 * enumerate → click → apply against the live selection) is exercised in the real
 * app. It is deliberately non-destructive - it *selects* the card the caret is in
 * rather than mutating the document - and is retired once the first real tool
 * ships.
 */
import type { Editor } from "@tiptap/core";

import { selectCard } from "../../blockfile";
import type { PreferenceField } from "../../preferences";
import type { CardToolDefinition } from "../registry";

/**
 * The demo tool's settings schema: one boolean, exercising the settings seam. A
 * `type` alias (not an `interface`) so it satisfies the `SectionSchema`
 * `Record<string, PreferenceField<unknown>>` index-signature constraint.
 */
export type DemoToolSettings = {
  /** Whether to focus the editor after selecting the card. */
  focusAfter: PreferenceField<boolean>;
};

/**
 * A reference card tool. Selects the whole card enclosing the current selection
 * (a `NodeSelection`, visible + undoable, never destructive) and, per its one
 * setting, focuses the editor afterwards. Returns whether a card was selected -
 * the truthiness a Tiptap command chain returns - so it is a no-op `false` when
 * the caret is not in a card.
 */
export const demoCardTool: CardToolDefinition<DemoToolSettings> = {
  id: "demo",
  label: "Select card",
  description:
    "Reference tool proving the card-cutting toolbar seam; selects the card " +
    "under the caret. Retired when the first real tool ships.",
  settings: {
    // Widened to `boolean` (the store-core convention) so it can be set to false.
    focusAfter: { default: true as boolean, label: "Focus after selecting" },
  },
  applyToSelection(editor: Editor, settings): boolean {
    const selected = selectCard(editor);
    if (selected && settings.focusAfter) editor.commands.focus();
    return selected;
  },
};
