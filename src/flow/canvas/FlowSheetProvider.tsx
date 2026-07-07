import { useEffect, useMemo, useState } from "react";

import type { DocumentHandle } from "../../documents/core";
import { observeColumns } from "../columns";
import { observeNodes } from "../nodes";
import { observeSubpoints } from "../subpoint";
import {
  FlowSheetContext,
  type FlowSheetContextValue,
} from "./flow-sheet-context";
import { readFlowContainerTree } from "./flow-collapse";
import { useFlowCollapse } from "./useFlowCollapse";
import { useFlowSelection } from "./useFlowSelection";

/** Props for {@link FlowSheetProvider}. */
export interface FlowSheetProviderProps {
  /** The open flow-sheet document, or `null` while opening. */
  handle: DocumentHandle | null;
  children: React.ReactNode;
}

/**
 * Provides the {@link FlowSheetContextValue} for a flow sheet: the handle plus
 * the active-column selection state (owned here, so the provider is the single
 * place that transient selection lives). Wrap the canvas in it so the column and
 * contention nodes can read the handle and drive/observe the active column.
 */
export function FlowSheetProvider({
  handle,
  children,
}: FlowSheetProviderProps) {
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const collapse = useFlowCollapse(handle);
  const selection = useFlowSelection();

  useEffect(() => {
    if (!handle) return;
    return observeColumns(handle, (columns) => {
      setActiveColumnId((prev) => {
        if (prev === null) return null;
        return columns.some((c) => c.id === prev) ? prev : null;
      });
    });
  }, [handle]);

  const { clearActiveNodeIfAbsent } = collapse;
  useEffect(() => {
    if (!handle) return;
    const check = () => {
      const { allIds } = readFlowContainerTree(handle);
      clearActiveNodeIfAbsent(new Set(allIds));
    };
    const unsubNodes = observeNodes(handle, check);
    const unsubSubpoints = observeSubpoints(handle, check);
    return () => {
      unsubNodes();
      unsubSubpoints();
    };
  }, [handle, clearActiveNodeIfAbsent]);

  const value = useMemo<FlowSheetContextValue>(
    () => ({ handle, activeColumnId, setActiveColumnId, collapse, selection }),
    [handle, activeColumnId, collapse, selection],
  );

  return (
    <FlowSheetContext.Provider value={value}>
      {children}
    </FlowSheetContext.Provider>
  );
}
