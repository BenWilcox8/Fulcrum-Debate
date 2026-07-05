/**
 * The flow-sheet canvas: the XYFlow surface that renders a flow sheet's speech
 * columns.
 *
 * Feature code consumes {@link FlowCanvas} (hand it a flow-sheet
 * `DocumentHandle`). The rest is the substrate the canvas is built from and the
 * seam later flow-node PRDs extend: the pure column -> node mapping
 * ({@link columnsToNodes} and layout constants), the live hook
 * ({@link useColumnNodes}), and the custom column node
 * ({@link SpeechColumnNode}).
 */
export { FlowCanvas, type FlowCanvasProps } from "./FlowCanvas";
export {
  FlowSheetPanel,
  type FlowSheetPanelProps,
} from "./FlowSheetPanel";
export {
  ColumnControls,
  type ColumnControlsProps,
} from "./ColumnControls";
export { SpeechColumnNode } from "./SpeechColumnNode";
export { useColumnNodes } from "./useColumnNodes";
export { useColumns } from "./useColumns";
export {
  columnsToNodes,
  columnX,
  columnsContentWidth,
  COLUMN_WIDTH,
  COLUMN_GAP,
  DEFAULT_COLUMN_HEIGHT,
  SPEECH_COLUMN_NODE_TYPE,
  type SpeechColumnNode as SpeechColumnNodeType,
  type SpeechColumnNodeData,
  type ColumnLayoutOptions,
} from "./column-nodes";
