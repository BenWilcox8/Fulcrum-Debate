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
import { argumentRowExtensions, argumentRowKeymap } from "../argument-rows";
import type { EditorPresetOptions } from "../../editor/preset";

/** Argument-row schema + Enter/Shift+Enter keymap, as a stable preset reference. */
export const FLOW_ARGUMENT_PRESET: EditorPresetOptions = {
  extensions: [...argumentRowExtensions, argumentRowKeymap],
};
