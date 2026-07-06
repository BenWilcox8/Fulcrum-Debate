import type { CardToolDefinition } from "./registry";

/**
 * The app's card-cutting tools, in toolbar order.
 *
 * This is the single list the app enumerates: the editor toolbar registers each
 * definition on a {@link createCardToolRegistry} and the Settings screen surfaces
 * each one's declared settings (via `toolSettingsContributions`). Adding a tool
 * here wires it into both surfaces at once.
 *
 * The individual tools (Extract, Shrink, Condense, Auto Speech, Send to Block
 * File) land in later slices, so the list is empty for now - the seam is live and
 * a real tool is a one-line addition.
 */
export const CARD_TOOL_DEFINITIONS: readonly CardToolDefinition[] = [];
