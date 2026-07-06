/**
 * The "Send to Block File" card tool - model half.
 *
 * The pure send operations ({@link sendSelectedCard}, {@link listSendDestinations})
 * and the registry {@link sendToBlockFileTool | tool definition} live here and are
 * React-free, so `src/tools` stays free of React (like the registry). The
 * interactive toolbar control ({@link ../send/SendToBlockFileControl}) is exported
 * from `src/tools/react` alongside the toolbar it plugs into.
 */
export {
  type SendMode,
  type SendTarget,
  type SendDestination,
  type SendResult,
  listSendDestinations,
  sendSelectedCard,
} from "./send-to-block-file";
export {
  type SendToolSettings,
  SEND_TOOL_ID,
  sendToBlockFileTool,
} from "./sendTool";
