/**
 * Card-Cutting Toolbar & Tool Customization Framework.
 *
 * {@link ./registry} is the tool registration contract every card-cutting tool
 * (Extract, Shrink, Condense, Auto Speech, Send to Block File) plugs into: a tool
 * declares an id, a label, a settings schema with defaults, and an
 * apply-to-selection operation; the registry wires its settings to the shared
 * preference store (one namespaced section per tool) and enumerates tools for the
 * future toolbar UI. The individual tools and the toolbar UI land in later slices.
 */
export {
  createCardToolRegistry,
  toolSectionId,
  toolSectionDefinition,
  TOOL_SECTION_ID_PREFIX,
  type CardToolDefinition,
  type RegisteredCardTool,
  type CardToolRegistry,
} from "./registry";
export { CARD_TOOL_DEFINITIONS } from "./cardTools";
export {
  condenseTool,
  canCondenseSelection,
  condenseSelection,
  CONDENSE_TOOL_ID,
  CONDENSE_TOOL_LABEL,
  type CondenseToolSettings,
} from "./condense";
