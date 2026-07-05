import { useEffect, useMemo, useState } from "react";

import type { DocumentHandle } from "../../documents/core";
import { listColumns, observeColumns } from "../columns";
import { listColumnNodes, observeNodes } from "../nodes";
import {
  flowNodesToNodes,
  type ColumnFlowNodes,
  type FlowNodeRegistry,
  type HostedFlowNode,
} from "./node-host";

/** A stable empty registry so callers can omit `flowNodeTypes` cheaply. */
const EMPTY_REGISTRY: FlowNodeRegistry = [];

/**
 * Groups a flow sheet's nodes by column, in the column list's document order and
 * each column's vertical order. A pure derivation of current state - it re-reads
 * the model rather than caching, mirroring the observe-and-recompute style of the
 * column seam.
 */
function readGroups(handle: DocumentHandle): ColumnFlowNodes[] {
  return listColumns(handle).map((column) => ({
    columnId: column.id,
    nodes: listColumnNodes(handle, column.id),
  }));
}

/**
 * Subscribes to a flow sheet's nodes and maps them to XYFlow child nodes hosted
 * in their columns, re-rendering whenever the nodes *or* the column list change
 * (a column removal orphans its nodes; a reorder changes grouping).
 *
 * This is the live seam between the flow-doc node model and the canvas host: it
 * drives {@link observeNodes} and {@link observeColumns} - pure derivations that
 * fire on every change and once immediately - and feeds the grouped result
 * through the pure {@link flowNodesToNodes} mapping against the registered node
 * kinds. A nullish handle or empty registry yields an empty list, so it is safe
 * to call unconditionally while a document is still opening.
 *
 * It awaits nothing beyond the document layer's local load: nodes appear (via the
 * observers) once IndexedDB has replayed into the doc, with no network in the
 * path - the offline-boot rule holds.
 */
export function useFlowNodes(
  handle: DocumentHandle | null,
  registry: FlowNodeRegistry = EMPTY_REGISTRY,
): HostedFlowNode[] {
  const [groups, setGroups] = useState<ColumnFlowNodes[]>(() =>
    handle ? readGroups(handle) : [],
  );

  useEffect(() => {
    if (!handle) {
      setGroups([]);
      return;
    }
    const recompute = () => setGroups(readGroups(handle));
    // Nodes drive membership/order; columns drive grouping (and orphaning on
    // removal). Both fire immediately, covering the initial read.
    const unobserveNodes = observeNodes(handle, recompute);
    const unobserveColumns = observeColumns(handle, recompute);
    return () => {
      unobserveNodes();
      unobserveColumns();
    };
  }, [handle]);

  return useMemo(
    () => flowNodesToNodes(groups, registry),
    [groups, registry],
  );
}
