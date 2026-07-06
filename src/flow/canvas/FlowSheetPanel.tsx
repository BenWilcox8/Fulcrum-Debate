import type { DocumentHandle } from "../../documents/core";
import { ColumnControls } from "./ColumnControls";
import { FlowCanvas } from "./FlowCanvas";
import { CONTENTION_FLOW_NODE_REGISTRY } from "./contention-node-type";
import { FlowSheetProvider } from "./FlowSheetProvider";
import { useFlowSheet } from "./flow-sheet-context";
import { useContentionTrigger } from "./useContentionTrigger";

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
  useContentionTrigger(handle, context?.activeColumnId ?? null);

  return (
    <div className={`flex h-full w-full flex-col ${className ?? ""}`}>
      <ColumnControls handle={handle} className="border-b border-shell-border" />
      <div className="min-h-0 flex-1">
        <FlowCanvas
          handle={handle}
          flowNodeTypes={CONTENTION_FLOW_NODE_REGISTRY}
        />
      </div>
    </div>
  );
}
