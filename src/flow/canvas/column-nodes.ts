/**
 * The pure column -> XYFlow-node mapping for the flow-sheet canvas.
 *
 * The canvas ({@link ./FlowCanvas}) renders the flow sheet's ordered speech
 * columns as XYFlow nodes. That rendering has two halves: this module - a pure,
 * side-effect-free translation from the {@link SpeechColumn} read model to
 * XYFlow `Node` objects - and the `<ReactFlow>` wiring that draws them. Keeping
 * the translation pure is what makes the canvas testable under jsdom, where
 * XYFlow's DOM measurement does not run (see the test file for the split).
 *
 * Each column becomes one `speechColumn` node laid out left-to-right in document
 * order, so panning horizontally walks the round's speeches in sequence. A
 * column node is deliberately shaped as a *container*: later flow-node PRDs add
 * child nodes that reference it by id (`parentId`), so the column id flows
 * straight through to the node id and the layout leaves a full-height body for
 * those children to occupy.
 */
import type { Node } from "@xyflow/react";

import type { FlowSide, SpeechColumn } from "../columns";

/** The XYFlow node `type` key for a speech column. */
export const SPEECH_COLUMN_NODE_TYPE = "speechColumn";

/** Fixed on-canvas width of one speech column, in flow-coordinate pixels. */
export const COLUMN_WIDTH = 320;

/** Horizontal gap between adjacent columns, in flow-coordinate pixels. */
export const COLUMN_GAP = 16;

/**
 * Fallback column height used before the canvas has measured its viewport (and
 * in non-DOM environments like jsdom). Once mounted, the canvas passes the live
 * viewport height so columns fill it top-to-bottom.
 */
export const DEFAULT_COLUMN_HEIGHT = 600;

/**
 * Data carried on a speech-column node. XYFlow requires node data to be a plain
 * record; this is the column's presentational fields (its id lives on the node
 * `id`, the canonical foreign key later flow nodes reference).
 */
export interface SpeechColumnNodeData extends Record<string, unknown> {
  /** Human-facing column label shown on the header (e.g. "1AC"). */
  readonly label: string;
  /** The debate side, driving the column's design-token colouring. */
  readonly side: FlowSide;
}

/** A fully-typed XYFlow node for one speech column. */
export type SpeechColumnNode = Node<SpeechColumnNodeData, typeof SPEECH_COLUMN_NODE_TYPE>;

/** Options controlling the column layout. */
export interface ColumnLayoutOptions {
  /**
   * Height in pixels each column node should occupy. Defaults to
   * {@link DEFAULT_COLUMN_HEIGHT}; the canvas supplies its measured viewport
   * height so columns render full-height.
   */
  height?: number;
}

/**
 * The x-origin of the column at `index`, in flow coordinates. Columns are
 * evenly spaced by {@link COLUMN_WIDTH} + {@link COLUMN_GAP}, so the origin is a
 * pure function of index - the layout never depends on measurement.
 */
export function columnX(index: number): number {
  return index * (COLUMN_WIDTH + COLUMN_GAP);
}

/**
 * The total flow-coordinate width spanned by `count` columns (including the
 * trailing column but not a trailing gap). The canvas is horizontally pannable
 * precisely because this can exceed the viewport width; tests assert that
 * relationship behaviourally rather than measuring pixels.
 */
export function columnsContentWidth(count: number): number {
  return count <= 0 ? 0 : count * COLUMN_WIDTH + (count - 1) * COLUMN_GAP;
}

/**
 * Translates the ordered speech columns into XYFlow nodes, preserving document
 * order and each column's stable id. Pure: given the same columns and options it
 * returns structurally identical nodes, with no dependence on the DOM.
 *
 * Nodes are non-draggable and non-selectable - this canvas is render-only; the
 * column-editing gestures (reorder/relabel) are a separate task.
 */
export function columnsToNodes(
  columns: readonly SpeechColumn[],
  { height = DEFAULT_COLUMN_HEIGHT }: ColumnLayoutOptions = {},
): SpeechColumnNode[] {
  return columns.map((column, index) => ({
    id: column.id,
    type: SPEECH_COLUMN_NODE_TYPE,
    position: { x: columnX(index), y: 0 },
    width: COLUMN_WIDTH,
    height,
    data: { label: column.label, side: column.side },
    // Render-only: no drag, no selection. A later task adds editing gestures.
    draggable: false,
    selectable: false,
  }));
}
