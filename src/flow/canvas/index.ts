/**
 * The flow-sheet canvas: the XYFlow surface that renders and manages a flow
 * sheet's speech columns.
 *
 * Feature code consumes {@link FlowSheetPanel} (hand it a flow-sheet
 * `DocumentHandle`) - it stacks {@link ColumnControls} (the write strip) above
 * {@link FlowCanvas} (the render-only canvas) on one handle. Use
 * {@link FlowCanvas} directly only when you need the render surface without
 * the column-management controls. The rest is substrate for later flow-node
 * PRDs: the pure column -> node mapping ({@link columnsToNodes} and layout
 * constants), the live hooks ({@link useColumnNodes}, {@link useColumns}), and
 * the custom column node ({@link SpeechColumnNode}).
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
