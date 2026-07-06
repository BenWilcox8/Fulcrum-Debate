import { useEffect, useState } from "react";

import type { DocumentHandle } from "../../documents/core";
import { observeSubpoints, listSubpoints, subpointContentFragment } from "../subpoint";
import { DocumentEditor } from "../../editor/react";
import { useFlowSheet } from "./flow-sheet-context";

/**
 * Live `S#` label for one subpoint: its 1-based rank among its contention's
 * subpoints. Like the contention's own header, this is a pure derivation of the
 * flow doc, observed so the label renumbers when a sibling subpoint is
 * added/removed/reordered - the rank-derived label is why the model stores no
 * subpoint number (in-order flowing `S1`, `S2`, ... reads naturally and a reorder
 * relabels for free).
 */
function useSubpointHeader(
  handle: DocumentHandle | null,
  contentionId: string,
  subpointId: string,
): string {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!handle || handle.closed) return;
    return observeSubpoints(handle, () => {
      const rank = listSubpoints(handle, contentionId).findIndex(
        (s) => s.id === subpointId,
      );
      setLabel(rank >= 0 ? `S${rank + 1}` : "");
    });
  }, [handle, contentionId, subpointId]);

  return label;
}

/** Props for {@link SubpointNode}. */
export interface SubpointNodeProps {
  /** The parent contention's node id (the subpoint's nesting key). */
  contentionId: string;
  /** This subpoint's stable id (keys its rank and its text fragment). */
  subpointId: string;
}

/**
 * One nested Subpoint container, rendered *inside* its contention's body.
 *
 * A subpoint is deliberately visually distinct from its contention: a small,
 * **dark** (`bg-shell-text`, light text) box, **indented** from the contention's
 * left edge with an accent rail, so the nesting hierarchy is obvious at a glance.
 * It carries an `S#` header (its rank) and an editable Tiptap surface bound to its
 * own per-node fragment ({@link subpointContentFragment}), so its text persists
 * and reloads with the flow-sheet document.
 *
 * The handle comes from {@link ./flow-sheet-context} (a subpoint renders inside
 * the contention node, which has no way to pass the live handle down through
 * XYFlow `data`); with no provider the box still renders its chrome and simply
 * omits the editor rather than throwing.
 */
export function SubpointNode({ contentionId, subpointId }: SubpointNodeProps) {
  const context = useFlowSheet();
  const handle = context?.handle ?? null;
  const label = useSubpointHeader(handle, contentionId, subpointId);

  return (
    <div
      data-testid="subpoint-node"
      data-flow-node-id={subpointId}
      className="ml-4 flex flex-col gap-1 rounded-md border-l-2 border-shell-border bg-shell-text pl-3 pr-2 py-2 text-shell-surface shadow-sm"
    >
      <div
        data-testid="subpoint-label"
        className="text-xs font-semibold text-shell-surface/80"
      >
        {label}
      </div>
      {handle && (
        <DocumentEditor
          handle={handle}
          fragment={subpointContentFragment(subpointId)}
          className="text-sm text-shell-surface"
        />
      )}
    </div>
  );
}
