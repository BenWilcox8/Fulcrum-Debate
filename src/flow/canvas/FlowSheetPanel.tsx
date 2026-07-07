import { useCallback } from "react";

import type { DocumentHandle } from "../../documents/core";
import { crossApplyContention } from "../cross-apply";
import { setNodeStruck } from "../strike";
import { ColumnControls } from "./ColumnControls";
import { FlowCanvas } from "./FlowCanvas";
import { RfdSection } from "./RfdSection";
import { CONTENTION_FLOW_NODE_REGISTRY } from "./contention-node-type";
import { FlowSheetProvider } from "./FlowSheetProvider";
import { useFlowSheet } from "./flow-sheet-context";
import { SendToSpeechControl } from "./SendToSpeechControl";
import { useContentionTrigger } from "./useContentionTrigger";
import {
  useCollapseAllExceptActiveHotkey,
  COLLAPSE_ALL_HOTKEY_LABEL,
} from "./useCollapseHotkey";

/** Props for {@link FlowSheetPanel}. */
export interface FlowSheetPanelProps {
  /**
   * The flow-sheet document to edit. `null` while opening - the panel paints
   * synchronously and fills in columns once the handle's local load resolves.
   */
  handle: DocumentHandle | null;
  /** Class applied to the panel's outer wrapper. */
  className?: string;
}

/**
 * The editable flow sheet: the {@link FlowCanvas} (rendering columns *and* the
 * Contention containers hosted in them) paired with the {@link ColumnControls}
 * write strip, both driven off the same handle. The controls mutate columns and
 * the canvas re-renders live through the shared `observeColumns` seam; the
 * canvas hosts contentions via the {@link CONTENTION_FLOW_NODE_REGISTRY}.
 *
 * It wraps both in a {@link FlowSheetProvider} so the column and contention nodes
 * share the handle and the active-column selection, and installs the C#
 * contention trigger ({@link useContentionTrigger}) - the keyboard-first way a
 * debater drops a contention into the focused column, no dialog. The panel adds
 * no document state of its own, so the local-first boot rule the canvas and
 * controls uphold carries through.
 *
 * Below the canvas it renders the {@link RfdSection} - the free-form Reason For
 * Decision region at the end of the flow, visually delineated from the speech
 * columns and persisted in the same flow document.
 */
export function FlowSheetPanel({ handle, className }: FlowSheetPanelProps) {
  return (
    <FlowSheetProvider handle={handle}>
      <FlowSheetPanelBody handle={handle} className={className} />
    </FlowSheetProvider>
  );
}

/**
 * The panel's inner body, rendered inside the {@link FlowSheetProvider} so it can
 * read the active-column selection and drive the trigger against it.
 */
function FlowSheetPanelBody({ handle, className }: FlowSheetPanelProps) {
  const context = useFlowSheet();
  const collapse = context?.collapse ?? null;
  useContentionTrigger(handle, context?.activeColumnId ?? null);
  useCollapseAllExceptActiveHotkey(collapse);

  // Dragging a contention onto another column cross-applies it: a copy lands in
  // the target column and a transparent arrow points from the original to the
  // copy. The canvas resolves the drop geometry; this performs the copy. When the
  // drop landed *adjacent* to an opponent's argument, the clash workflow also
  // strikes that argument (non-destructively) - so dropping next to it both
  // cross-applies AND strikes, per the DnD/Strike PRD.
  const onNodeCrossColumnDrop = useCallback(
    (
      nodeId: string,
      _fromColumnId: string,
      toColumnId: string,
      adjacentNodeId: string | null,
    ) => {
      if (!handle || handle.closed) return;
      handle.doc.transact(() => {
        crossApplyContention(handle, nodeId, toColumnId);
        if (adjacentNodeId) setNodeStruck(handle, adjacentNodeId, true);
      });
    },
    [handle],
  );

  return (
    <div className={`flex h-full w-full flex-col ${className ?? ""}`}>
      <ColumnControls handle={handle} className="border-b border-shell-border" />
      <div className="flex items-center gap-2 border-b border-shell-border px-card py-1">
        <button
          type="button"
          data-testid="collapse-all-except-active"
          onClick={() => collapse?.collapseAllExceptActive()}
          title={`Collapse every contention and subpoint except the active one (${COLLAPSE_ALL_HOTKEY_LABEL})`}
          className="rounded border border-shell-border bg-shell-surface px-2 py-1 text-xs font-medium text-shell-text hover:bg-shell-bg"
        >
          Collapse all except active
        </button>
        <SendToSpeechControl />
      </div>
      <div className="min-h-0 flex-1">
        <FlowCanvas
          handle={handle}
          flowNodeTypes={CONTENTION_FLOW_NODE_REGISTRY}
          onNodeCrossColumnDrop={onNodeCrossColumnDrop}
        />
      </div>
      <RfdSection handle={handle} />
    </div>
  );
}
