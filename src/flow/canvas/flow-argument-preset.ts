/**
 * The shared editor preset for a flow-node text surface (a contention or a
 * subpoint): the argument-row schema plus the Enter / Shift+Enter keymap, layered
 * through the shared preset's feature-extension seam.
 *
 * Split into its own module (not a component file) so both {@link ./ContentionNode}
 * and {@link ./SubpointNode} share one **stable** reference - {@link useDocumentEditor}
 * only rebuilds on a preset identity change, so a module-level constant is the
 * documented way to pass it - without a component importing a value from another
 * component module (which would trip `react-refresh/only-export-components` and
 * risk a circular import).
 */
import { argumentRowExtensions } from "../argument-rows";
import { shorthandRuntimeExtension } from "../../shorthand";
import type { EditorPresetOptions } from "../../editor/preset";
import { flowShorthandRowKeymap } from "./flow-shorthand-keymap";

/**
 * Argument-row schema + the shorthand-aware Enter/Shift+Enter keymap + the
 * shorthand runtime storage slot, as a stable preset reference.
 *
 * The keymap is {@link ./flow-shorthand-keymap.flowShorthandRowKeymap} (not the
 * plain `argumentRowKeymap`): it runs the same row transitions but expands the
 * completed row first when the editor's live shorthand runtime enables it. The
 * runtime is disabled by default (declared by {@link shorthandRuntimeExtension} and
 * pushed live by {@link ../../shorthand/react.useSurfaceShorthand}), so with no
 * dictionary or an excluding scope the row behaviour is unchanged.
 */
export const FLOW_ARGUMENT_PRESET: EditorPresetOptions = {
  extensions: [
    ...argumentRowExtensions,
    flowShorthandRowKeymap,
    shorthandRuntimeExtension,
  ],
};
