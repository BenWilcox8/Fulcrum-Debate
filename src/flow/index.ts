/**
 * Public surface of the flow-sheet data layer.
 *
 * The flow sheet's spine is an ordered list of speech columns stored on a
 * `flow-sheet` document. This module is that model and its helpers only - no UI,
 * no React, no flow-node content (all later PRDs). See {@link ./columns} for the
 * full design notes and the fragment convention it follows.
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
