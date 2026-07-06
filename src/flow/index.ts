/**
 * Public surface of the flow-sheet data layer.
 *
 * The flow sheet's spine is an ordered list of speech columns stored on a
 * `flow-sheet` document; flow nodes then live inside those columns. This module
 * is those two models and their helpers only - no UI, no React. See
 * {@link ./columns} for the column model and its fragment convention, and
 * {@link ./nodes} for the node-container contract (membership + vertical order)
 * that later flow-node PRDs build on.
 */
export {
  FLOW_COLUMNS_FRAGMENT,
  FLOW_SIDES,
  isFlowSide,
  listColumns,
  getColumn,
  addColumn,
  relabelColumn,
  moveColumn,
  removeColumn,
  observeColumns,
  type FlowSide,
  type SpeechColumn,
  type AddColumnInput,
} from "./columns";
export {
  FLOW_NODES_FRAGMENT,
  listNodes,
  listColumnNodes,
  getNode,
  addNode,
  moveNode,
  removeNode,
  observeNodes,
  type FlowNode,
  type AddNodeInput,
} from "./nodes";
export {
  CONTENTION_KIND,
  CONTENTION_CONTENT_FRAGMENT_PREFIX,
  contentionContentFragment,
  parseContentionTrigger,
  addContention,
  listContentions,
} from "./contention";
export {
  ARGUMENT_NODE_NAME,
  RESPONSE_NODE_NAME,
  argument,
  response,
  flowArgumentDocument,
  argumentRowExtensions,
  argumentRowKeymap,
  newArgumentRow,
  newGroupedResponse,
  locateArgumentRows,
  type ResponseSpan,
  type ArgumentRowSpan,
} from "./argument-rows";
export {
  FLOW_SUBPOINTS_FRAGMENT,
  SUBPOINT_CONTENT_FRAGMENT_PREFIX,
  subpointContentFragment,
  parseSubpointTrigger,
  addSubpoint,
  listSubpoints,
  getSubpoint,
  removeSubpoint,
  observeSubpoints,
  type FlowSubpoint,
} from "./subpoint";
