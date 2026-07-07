import { useCallback, useMemo, useState } from "react";

/**
 * The live, transient **multi-selection** of flow containers - the store the
 * {@link ./FlowSheetProvider} exposes on the flow-sheet context and the node
 * chrome (a contention/subpoint box) drives via Shift+Click. It is the source of
 * truth for "which arguments has the debater picked to send", read by the
 * {@link ./SendToSpeechControl} when a Ctrl/Cmd+Enter send fires.
 *
 * Like the collapse view-state (see {@link ./useFlowCollapse}), it holds **no**
 * document data: a selection is a moment-to-moment gesture toward a send, not a
 * property of the case worth persisting, so it lives in React and a reload starts
 * with nothing selected (and it never enters the Yjs shared types, so it never
 * syncs or conflicts).
 */
export interface FlowSelectionState {
  /** The set of currently-selected container ids (contentions and/or subpoints). */
  readonly selectedNodeIds: ReadonlySet<string>;
  /** How many containers are currently selected. */
  readonly count: number;
  /** Whether the given container id is currently selected. */
  isSelected(nodeId: string): boolean;
  /** Flips a single container's selection - the Shift+Click toggle. */
  toggle(nodeId: string): void;
  /** Clears the whole selection (e.g. after a successful send). */
  clear(): void;
}

/**
 * Owns the transient flow-container selection. The selected-id set is plain React
 * state (never persisted), so reopening a round starts with an empty selection.
 * {@link FlowSelectionState.toggle} is the Shift+Click gesture (select, then
 * Shift+Click again to deselect); {@link FlowSelectionState.clear} resets it.
 */
export function useFlowSelection(): FlowSelectionState {
  const [selectedNodeIds, setSelectedNodeIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const isSelected = useCallback(
    (nodeId: string) => selectedNodeIds.has(nodeId),
    [selectedNodeIds],
  );

  const toggle = useCallback((nodeId: string) => {
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedNodeIds((prev) => (prev.size === 0 ? prev : new Set<string>()));
  }, []);

  return useMemo<FlowSelectionState>(
    () => ({
      selectedNodeIds,
      count: selectedNodeIds.size,
      isSelected,
      toggle,
      clear,
    }),
    [selectedNodeIds, isSelected, toggle, clear],
  );
}
