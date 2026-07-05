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
 *
 * The **node-container contract** - how a registered flow-node kind is hosted
 * inside a column - is the {@link ./node-host} surface: register kinds via
 * {@link FlowCanvas}'s `flowNodeTypes` prop, whose definitions
 * ({@link FlowNodeTypeDefinition}) name a `kind` and its component. The pure
 * host mapping ({@link flowNodesToNodes}) and the live hook
 * ({@link useFlowNodes}) are the substrate behind that prop.
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
export { useFlowNodes } from "./useFlowNodes";
export {
  flowNodesToNodes,
  flowNodeY,
  registryToNodeTypes,
  FLOW_NODE_INSET_X,
  FLOW_NODE_WIDTH,
  FLOW_NODE_TOP_INSET,
  FLOW_NODE_HEIGHT,
  FLOW_NODE_GAP,
  type FlowNodeData,
  type FlowNodeComponent,
  type FlowNodeTypeDefinition,
  type FlowNodeRegistry,
  type HostedFlowNode,
  type ColumnFlowNodes,
} from "./node-host";
