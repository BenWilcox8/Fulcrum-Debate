import { useId } from "react";
import type { DocumentHandle } from "../../documents/core";
import { DocumentEditor } from "../../editor/react";
import { FLOW_RFD_FRAGMENT } from "../rfd";

/** Props for {@link RfdSection}. */
export interface RfdSectionProps {
  /**
   * The flow-sheet document whose RFD text this region edits. `null` while the
   * round is opening - the region paints its heading synchronously and the
   * editable surface mounts once the handle's local load resolves.
   */
  handle: DocumentHandle | null;
  /** Class applied to the region's outer wrapper. */
  className?: string;
}

/**
 * The **Reason For Decision** region at the end of the flow sheet: a single
 * free-form text surface a debater fills in after a round to record the judge's
 * reason for the decision.
 *
 * It binds the shared {@link DocumentEditor} to the flow document's fixed
 * {@link FLOW_RFD_FRAGMENT} `rfd` fragment, so RFD text persists with the round
 * and reloads intact through the same Yjs + y-indexeddb path as every other text
 * surface in the app - no bespoke storage.
 *
 * The region is deliberately delineated from the speech columns: it is a
 * separate `<section>` below the canvas with its own top border, surface
 * background, and a labelled heading, so it is easy to find at the end of the
 * flow rather than blending into the column grid.
 */
export function RfdSection({ handle, className }: RfdSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-testid="rfd-section"
      // `shrink-0` keeps the RFD at its usable floor when the flow sheet is short
      // (e.g. a bottom-docked speech pane): without it the region is a flex child
      // that collapses to a ~60px sliver as the canvas above claims the height.
      // The canvas (which pans internally) absorbs the squeeze instead.
      className={`flex shrink-0 flex-col gap-2 border-t-2 border-shell-border bg-shell-surface px-card py-3 ${className ?? ""}`}
    >
      <h3
        id={headingId}
        className="text-xs font-semibold uppercase tracking-wide text-shell-muted"
      >
        Reason For Decision
      </h3>
      <DocumentEditor
        handle={handle}
        fragment={FLOW_RFD_FRAGMENT}
        className="rfd-editor min-h-16 max-h-40 overflow-y-auto rounded border border-shell-border bg-shell-bg px-3 py-2 text-sm text-shell-text focus-within:border-shell-muted"
      />
    </section>
  );
}
