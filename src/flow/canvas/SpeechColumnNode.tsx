import type { NodeProps } from "@xyflow/react";

import type { FlowSide } from "../columns";
import type { SpeechColumnNode as SpeechColumnNodeType } from "./column-nodes";
import { useFlowSheet } from "./flow-sheet-context";

/**
 * Per-side design-token classes. The colouring convention (light blue = aff,
 * light red = neg) lives entirely in the named tokens from `src/index.css`
 * (`aff-soft`/`aff-strong`, `neg-soft`/`neg-strong`) - never raw hex here - so
 * the palette stays defined in one place. Tests assert these class names, which
 * is how "aff and neg are visibly distinct" is checked behaviourally.
 */
const SIDE_CLASSES: Record<
  FlowSide,
  { column: string; header: string }
> = {
  aff: {
    column: "bg-aff-soft border-aff-strong",
    header: "bg-aff-strong text-shell-surface",
  },
  neg: {
    column: "bg-neg-soft border-neg-strong",
    header: "bg-neg-strong text-shell-surface",
  },
};

/**
 * The custom XYFlow node for one speech column: a full-height, side-coloured
 * panel with a labelled header and an open body region.
 *
 * The body (`data-column-body`) is the deliberate seam for the upcoming
 * node-container task: later flow nodes are XYFlow child nodes parented to this
 * column, and this is where they render. This component renders no node content
 * itself yet - it establishes the container and its colouring only.
 *
 * Clicking the column makes it the flow sheet's **active column** (via
 * {@link ./flow-sheet-context}), which is where the C# contention trigger routes.
 * The active column carries a neutral focus ring so a debater can see where a
 * typed `C1` will land. Outside a {@link FlowSheetProvider} the click is inert
 * (the context is `null`), so a bare render-only canvas is unaffected.
 */
export function SpeechColumnNode({
  id,
  data,
}: NodeProps<SpeechColumnNodeType>) {
  const classes = SIDE_CLASSES[data.side];
  const context = useFlowSheet();
  const active = context != null && context.activeColumnId === id;
  return (
    <div
      data-testid="speech-column"
      data-side={data.side}
      data-active={active || undefined}
      onClick={() => context?.setActiveColumnId(id)}
      className={`pointer-events-auto flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-lg border ${classes.column} ${
        active ? "ring-2 ring-shell-text" : ""
      }`}
    >
      <div
        className={`px-card py-2 text-sm font-semibold ${classes.header}`}
      >
        {data.label}
      </div>
      {/* Seam: later flow nodes render as child nodes inside this region. */}
      <div data-column-body className="flex-1" />
    </div>
  );
}
