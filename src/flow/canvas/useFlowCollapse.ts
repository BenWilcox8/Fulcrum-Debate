import { useCallback, useMemo, useState } from "react";

import type { DocumentHandle } from "../../documents/core";
import { collapseTargets, readFlowContainerTree } from "./flow-collapse";

/**
 * The live, transient collapse view-state for one flow sheet - the store the
 * {@link ./FlowSheetProvider} exposes on the flow-sheet context and the node
 * chrome (headers, bars, the toolbar button, the hotkey) reads and drives.
 *
 * It holds no document data: collapse/expand and the active node are ephemeral UI
 * state (see the transient-by-design note in {@link ./flow-collapse}), so a
 * reload starts fully expanded.
 */
export interface FlowCollapseState {
  /** The set of currently-collapsed container ids (contentions and subpoints). */
  readonly collapsedNodeIds: ReadonlySet<string>;
  /**
   * The active node: the container last interacted with (header clicked or text
   * surface focused), or `null` if none yet. Defines the one "Collapse All Except
   * Active" keeps open.
   */
  readonly activeNodeId: string | null;
  /** Whether the given container id is currently collapsed. */
  isCollapsed(nodeId: string): boolean;
  /** Sets a single container's collapse state. */
  setCollapsed(nodeId: string, collapsed: boolean): void;
  /** Flips a single container's collapse state. */
  toggleCollapsed(nodeId: string): void;
  /** Marks (or clears, with `null`) the active node. */
  setActiveNodeId(nodeId: string | null): void;
  /**
   * Collapses every container except the active one and its ancestor chain (so an
   * active subpoint's parent contention stays open). With no active node,
   * collapses everything. Reads the live container tree off the handle.
   */
  collapseAllExceptActive(): void;
}

/**
 * Owns the transient collapse view-state for a flow sheet. The collapsed-id set
 * and the active node are plain React state (never persisted), so reopening a
 * round starts fully expanded. {@link collapseAllExceptActive} reads the live
 * container tree from the handle at call time via {@link readFlowContainerTree},
 * so it always reflects the contentions/subpoints on the sheet right now.
 *
 * With a `null` handle the store still works for the single-node toggles (the
 * chrome stays interactive while a document is opening); the bulk operation is a
 * no-op until a handle exists.
 */
export function useFlowCollapse(
  handle: DocumentHandle | null,
): FlowCollapseState {
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  const isCollapsed = useCallback(
    (nodeId: string) => collapsedNodeIds.has(nodeId),
    [collapsedNodeIds],
  );

  const setCollapsed = useCallback((nodeId: string, collapsed: boolean) => {
    setCollapsedNodeIds((prev) => {
      if (prev.has(nodeId) === collapsed) return prev;
      const next = new Set(prev);
      if (collapsed) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback((nodeId: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const collapseAllExceptActive = useCallback(() => {
    if (!handle || handle.closed) return;
    const { allIds, parentOf } = readFlowContainerTree(handle);
    setCollapsedNodeIds(collapseTargets(allIds, activeNodeId, parentOf));
  }, [handle, activeNodeId]);

  return useMemo<FlowCollapseState>(
    () => ({
      collapsedNodeIds,
      activeNodeId,
      isCollapsed,
      setCollapsed,
      toggleCollapsed,
      setActiveNodeId,
      collapseAllExceptActive,
    }),
    [
      collapsedNodeIds,
      activeNodeId,
      isCollapsed,
      setCollapsed,
      toggleCollapsed,
      collapseAllExceptActive,
    ],
  );
}
