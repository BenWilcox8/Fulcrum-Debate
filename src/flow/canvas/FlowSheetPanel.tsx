import type { DocumentHandle } from "../../documents/core";
import { ColumnControls } from "./ColumnControls";
import { FlowCanvas } from "./FlowCanvas";

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
 * The editable flow sheet: the render-only {@link FlowCanvas} paired with the
 * {@link ColumnControls} write strip, both driven off the same handle. The
 * controls mutate the flow-sheet model directly (add / relabel / reorder /
 * remove) and the canvas re-renders live through the shared `observeColumns`
 * seam - this component just stacks the two, adding no state of its own, so the
 * local-first boot rule the canvas and controls each uphold carries through.
 */
export function FlowSheetPanel({ handle, className }: FlowSheetPanelProps) {
  return (
    <div className={`flex h-full w-full flex-col ${className ?? ""}`}>
      <ColumnControls handle={handle} className="border-b border-shell-border" />
      <div className="min-h-0 flex-1">
        <FlowCanvas handle={handle} />
      </div>
    </div>
  );
}
