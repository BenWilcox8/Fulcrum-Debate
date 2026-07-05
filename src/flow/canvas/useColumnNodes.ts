import { useEffect, useMemo, useState } from "react";

import type { DocumentHandle } from "../../documents/core";
import { listColumns, observeColumns, type SpeechColumn } from "../columns";
import {
  columnsToNodes,
  type SpeechColumnNode,
} from "./column-nodes";

/**
 * Subscribes to a flow sheet's speech columns and maps them to XYFlow nodes,
 * re-rendering whenever the columns change (add / remove / reorder / relabel).
 *
 * This is the live seam between the flow-sheet document model and the canvas:
 * it drives {@link observeColumns} - a pure derivation of current state that
 * fires on every column change and once immediately - and feeds the result
 * through the pure {@link columnsToNodes} mapping. A nullish handle yields an
 * empty node list, so it is safe to call unconditionally while a document is
 * still opening.
 *
 * It gates on nothing async beyond the document layer's local load: the columns
 * simply appear (via the observer) once IndexedDB has replayed into the doc,
 * with no network in the path.
 */
export function useColumnNodes(
  handle: DocumentHandle | null,
  height?: number,
): SpeechColumnNode[] {
  const [columns, setColumns] = useState<SpeechColumn[]>(() =>
    handle ? listColumns(handle) : [],
  );

  useEffect(() => {
    if (!handle) {
      setColumns([]);
      return;
    }
    // observeColumns fires immediately with the current snapshot and again on
    // every change, so this covers both the initial read and live updates.
    return observeColumns(handle, setColumns);
  }, [handle]);

  return useMemo(
    () => columnsToNodes(columns, { height }),
    [columns, height],
  );
}
