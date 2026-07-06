import type { CardToolDefinition } from "./registry";
import { shrinkCardTool } from "./shrink/shrinkCardTool";
import { highlightCardTool } from "./highlight/highlightCardTool";
import { sendToBlockFileTool } from "./send/sendTool";

/**
 * The app's card-cutting tools, in toolbar order.
 *
 * This is the single list the app enumerates: the editor toolbar registers each
 * definition on a {@link createCardToolRegistry} (via `useCardTools`) and the
 * Settings screen surfaces each one's declared settings (via
 * `toolSettingsContributions`). Adding a tool here wires it into both surfaces at
 * once.
 *
 * The remaining tools (Auto Speech) land in later slices; each is a one-line
 * addition here.
 */
export const CARD_TOOL_DEFINITIONS: readonly CardToolDefinition[] = [
  shrinkCardTool as CardToolDefinition,
  highlightCardTool as CardToolDefinition,
  sendToBlockFileTool as CardToolDefinition,
];
