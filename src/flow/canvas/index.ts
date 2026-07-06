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
export { RfdSection, type RfdSectionProps } from "./RfdSection";
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
export { useFlowEdges } from "./useFlowEdges";
export {
  flowEdgesToEdges,
  CROSS_APPLICATION_EDGE_OPACITY,
} from "./flow-edge";
export {
  columnAtX,
  resolveNodeDropColumn,
  resolveAdjacentNode,
  ADJACENCY_MARGIN,
  type DropColumn,
  type NodeDropInput,
  type DropTargetNode,
} from "./flow-drag";
export { ContentionNode } from "./ContentionNode";
export { SubpointNode, type SubpointNodeProps } from "./SubpointNode";
export { useSubpointTrigger } from "./useSubpointTrigger";
export {
  stepSubpointTrigger,
  type SubpointTriggerStep,
} from "./subpoint-trigger";
export {
  CONTENTION_FLOW_NODE_TYPE,
  CONTENTION_FLOW_NODE_REGISTRY,
  CONTENTION_NODE_HEIGHT,
} from "./contention-node-type";
export {
  FlowSheetProvider,
  type FlowSheetProviderProps,
} from "./FlowSheetProvider";
export {
  useFlowSheet,
  type FlowSheetContextValue,
} from "./flow-sheet-context";
export { useContentionTrigger } from "./useContentionTrigger";
export {
  stepContentionTrigger,
  type ContentionTriggerStep,
} from "./contention-trigger";
export { useFlowCollapse, type FlowCollapseState } from "./useFlowCollapse";
export {
  collapseTargets,
  readFlowContainerTree,
  type FlowContainerTree,
} from "./flow-collapse";
export {
  useCollapseAllExceptActiveHotkey,
  COLLAPSE_ALL_HOTKEY_LABEL,
} from "./useCollapseHotkey";
export {
  flowNodesToNodes,
  flowNodeY,
  registryToNodeTypes,
  FLOW_NODE_INSET_X,
  FLOW_NODE_WIDTH,
  FLOW_NODE_TOP_INSET,
  FLOW_NODE_HEIGHT,
  FLOW_NODE_GAP,
  COLLAPSED_NODE_HEIGHT,
  type FlowNodeData,
  type FlowNodeComponent,
  type FlowNodeTypeDefinition,
  type FlowNodeRegistry,
  type FlowNodeLayoutOptions,
  type HostedFlowNode,
  type ColumnFlowNodes,
} from "./node-host";
