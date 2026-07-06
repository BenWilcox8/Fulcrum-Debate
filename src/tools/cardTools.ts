import type { CardToolDefinition } from "./registry";
import { shrinkCardTool } from "./shrink/shrinkCardTool";

/**
 * The app's card-cutting tools, in toolbar order.
 *
 * This is the single list the app enumerates: the editor toolbar registers each
 * definition on a {@link createCardToolRegistry} and the Settings screen surfaces
 * each one's declared settings (via `toolSettingsContributions`). Adding a tool
 * here wires it into both surfaces at once.
 *
 * The remaining tools (Extract, Condense, Auto Speech, Send to Block File) land in
 * later slices; each is a one-line addition here.
 */
export const CARD_TOOL_DEFINITIONS: readonly CardToolDefinition[] = [
  shrinkCardTool as CardToolDefinition,
];
