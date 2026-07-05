import { useEffect, useState } from "react";

import type { DocumentHandle } from "../../documents/core";
import { listColumns, observeColumns, type SpeechColumn } from "../columns";

/**
 * Subscribes to a flow sheet's ordered speech columns as plain snapshots,
 * re-rendering whenever the columns change (add / relabel / reorder / remove).
 *
 * This is the read side the column-management controls consume, mirroring
 * {@link useColumnNodes} but yielding the raw {@link SpeechColumn} model rather
 * than XYFlow nodes. It drives the same {@link observeColumns} seam - a pure
 * derivation of current state that fires once immediately and again on every
 * change - so a control strip and the canvas always agree on the column list. A
 * nullish handle yields an empty list, so it is safe to call unconditionally
 * while a document is still opening; nothing here awaits the network.
 */
export function useColumns(handle: DocumentHandle | null): SpeechColumn[] {
  const [columns, setColumns] = useState<SpeechColumn[]>(() =>
    handle ? listColumns(handle) : [],
  );

  useEffect(() => {
    if (!handle) {
      setColumns([]);
      return;
    }
    return observeColumns(handle, setColumns);
  }, [handle]);

  return columns;
}
