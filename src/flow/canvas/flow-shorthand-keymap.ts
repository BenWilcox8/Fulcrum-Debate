/**
 * The flow surface's Enter / Shift+Enter keymap **with shorthand expansion wired
 * in** - the slice-2 wiring of the Shorthand Engine onto the flow's argument rows.
 *
 * It binds the same two gestures the plain
 * {@link ../argument-rows.argumentRowKeymap} does, but routes each through
 * {@link ../../shorthand.expandTransition}: on a transition it expands the
 * just-completed row's abbreviations first (when the editor's live shorthand
 * runtime is enabled for this surface - the scope gate) **then** runs the surface's
 * own transition command. It wraps {@link newArgumentRow} / {@link newGroupedResponse}
 * rather than re-deriving the split, per the argument-row key-event contract, so
 * the two commands stay the single source of truth for what Enter / Shift+Enter do.
 *
 * This replaces `argumentRowKeymap` in {@link ./flow-argument-preset}; the runtime
 * that gates expansion is pushed onto the editor by
 * {@link ../../shorthand/react.useSurfaceShorthand} with the `"flow"` surface. When
 * shorthand is disabled (default runtime, or scope excludes the flow), each binding
 * simply runs its transition unchanged, so the flow's row behaviour is identical to
 * before.
 *
 * A committed `S#` subpoint trigger is cancelled in the capture phase before
 * ProseMirror (and therefore this keymap) sees the Enter, so only a non-`S#` Enter
 * reaches expansion - the two gestures compose cleanly.
 */
import { Extension } from "@tiptap/core";

import { expandTransition } from "../../shorthand";
import { newArgumentRow, newGroupedResponse } from "../argument-rows";

/**
 * The flow argument-row keymap that runs shorthand expansion at the transition.
 * High priority (matching `argumentRowKeymap`) so its Enter wins over the editor's
 * baseline block-split, falling through when the caret is not inside a row.
 */
export const flowShorthandRowKeymap: Extension = Extension.create({
  name: "flowShorthandRowKeymap",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () => expandTransition(this.editor, newArgumentRow),
      "Shift-Enter": () => expandTransition(this.editor, newGroupedResponse),
    };
  },
});
