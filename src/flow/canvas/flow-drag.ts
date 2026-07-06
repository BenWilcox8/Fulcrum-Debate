/**
 * The pure drop-target arithmetic for cross-application drag: given where a
 * dragged flow node ended up and the column layout, which column did it land on?
 *
 * XYFlow measures the DOM (which does not run under jsdom), so the drag *wiring*
 * lives in {@link ./FlowCanvas} and is verified in the browser; this module is
 * the measurement-free geometry it delegates to, kept pure so it is unit-
 * testable. A dragged child node's position is relative to its (source) column,
 * so resolving the drop is "project the node's center into absolute canvas x,
 * then find the column whose span contains it".
 */

/** One column's horizontal placement on the canvas, in flow coordinates. */
export interface DropColumn {
  /** The column's stable id (its XYFlow node id). */
  readonly id: string;
  /** The column's x-origin in flow coordinates (its XYFlow `position.x`). */
  readonly x: number;
  /** The column's width in flow coordinates. */
  readonly width: number;
}

/**
 * The id of the column whose horizontal span `[x, x + width)` contains the
 * absolute canvas x-coordinate `centerX`, or `null` when it lands in a gap
 * between columns or beyond the outermost edges. A drop that misses every column
 * body is intentionally *no* target (never a nearest-column guess), so a debater
 * who drops into a gap gets no accidental copy.
 */
export function columnAtX(
  centerX: number,
  columns: readonly DropColumn[],
): string | null {
  for (const column of columns) {
    if (centerX >= column.x && centerX < column.x + column.width) {
      return column.id;
    }
  }
  return null;
}

/** Inputs to {@link resolveNodeDropColumn}. */
export interface NodeDropInput {
  /** The id of the column the dragged node started in (its `parentId`). */
  readonly sourceColumnId: string;
  /**
   * The dragged node's x-position *relative to its source column* after the
   * drag (its XYFlow `position.x`, which may run negative or exceed the column
   * width once dragged across a boundary).
   */
  readonly nodeRelX: number;
  /** The dragged node's width, used to take its horizontal center. */
  readonly nodeWidth: number;
  /** The current column layout. */
  readonly columns: readonly DropColumn[];
}

/**
 * Resolves which column a dragged flow node was dropped on. Projects the node's
 * center into absolute canvas coordinates - the source column's origin plus the
 * node's relative x plus half its width - and finds the containing column via
 * {@link columnAtX}. Returns `null` when the source column is unknown or the
 * center lands in a gap.
 *
 * The caller compares the result to `sourceColumnId`: equal (or `null`) means no
 * cross-application, a different id means copy into that column.
 */
export function resolveNodeDropColumn({
  sourceColumnId,
  nodeRelX,
  nodeWidth,
  columns,
}: NodeDropInput): string | null {
  const source = columns.find((column) => column.id === sourceColumnId);
  if (!source) return null;
  const centerX = source.x + nodeRelX + nodeWidth / 2;
  return columnAtX(centerX, columns);
}
