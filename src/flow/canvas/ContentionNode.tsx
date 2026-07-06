import { useEffect, useState } from "react";
import { EditorContent } from "@tiptap/react";
import type { NodeProps } from "@xyflow/react";

import type { DocumentHandle } from "../../documents/core";
import type { FlowSide } from "../columns";
import { getColumn, observeColumns } from "../columns";
import { observeNodes } from "../nodes";
import { contentionContentFragment, listContentions } from "../contention";
import { listSubpoints, observeSubpoints, type FlowSubpoint } from "../subpoint";
import { useDocumentEditor } from "../../editor/react";
import type { HostedFlowNode } from "./node-host";
import { useFlowSheet } from "./flow-sheet-context";
import { useSubpointTrigger } from "./useSubpointTrigger";
import { SubpointNode } from "./SubpointNode";

/**
 * Per-side design-token classes for the contention container, mirroring the
 * {@link ./SpeechColumnNode} colour convention (aff = blue, neg = red) so a
 * contention reads as belonging to its column's side. Named tokens only, never
 * raw hex - tests assert these class names, which is how "side-coloured" is
 * checked behaviourally.
 */
const SIDE_CLASSES: Record<FlowSide, { container: string; header: string }> = {
  aff: {
    container: "bg-shell-surface border-aff-strong",
    header: "text-aff-strong",
  },
  neg: {
    container: "bg-shell-surface border-neg-strong",
    header: "text-neg-strong",
  },
};

/**
 * Live header state for a contention: its `C#` label (its 1-based rank among the
 * column's contentions) and its side (from its column). Both are pure
 * derivations of the flow doc, observed so the label renumbers when a sibling
 * contention is added/removed/reordered and the colour follows a side change.
 * The rank-derived label is why the model stores no contention number: in-order
 * flowing (`C1`, `C2`, ...) reads naturally, and a reorder relabels for free.
 */
function useContentionHeader(
  handle: DocumentHandle | null,
  columnId: string,
  nodeId: string,
): { label: string; side: FlowSide } {
  const [state, setState] = useState<{ label: string; side: FlowSide }>({
    label: "",
    side: "aff",
  });

  useEffect(() => {
    if (!handle || handle.closed) return;
    const recompute = () => {
      const rank = listContentions(handle, columnId).findIndex(
        (n) => n.id === nodeId,
      );
      const side = getColumn(handle, columnId)?.side ?? "aff";
      setState({ label: rank >= 0 ? `C${rank + 1}` : "", side });
    };
    // Rank rides the node list; side rides the column list. Both fire once
    // immediately, covering the initial read.
    const unobserveNodes = observeNodes(handle, recompute);
    const unobserveColumns = observeColumns(handle, recompute);
    return () => {
      unobserveNodes();
      unobserveColumns();
    };
  }, [handle, columnId, nodeId]);

  return state;
}

/**
 * The live list of subpoints nested under a contention, observed so a subpoint
 * added by the S# trigger appears immediately. A pure derivation of the flow doc
 * ({@link listSubpoints}), so the component never manages invalidation.
 */
function useContentionSubpoints(
  handle: DocumentHandle | null,
  contentionId: string,
): FlowSubpoint[] {
  const [subpoints, setSubpoints] = useState<FlowSubpoint[]>([]);

  useEffect(() => {
    if (!handle || handle.closed) {
      setSubpoints([]);
      return;
    }
    return observeSubpoints(handle, () => {
      setSubpoints(listSubpoints(handle, contentionId));
    });
  }, [handle, contentionId]);

  return subpoints;
}

/**
 * The custom XYFlow node for one Contention container.
 *
 * A contention is a large, rounded, side-coloured panel with a `C#` header and
 * an editable Tiptap argument-text surface bound to the contention's own
 * per-node fragment ({@link contentionContentFragment}), so its text persists and
 * reloads with the flow-sheet document. The handle comes from
 * {@link ./flow-sheet-context} (XYFlow node `data` cannot carry it); with no
 * provider the node still renders its chrome and simply omits the editor rather
 * than throwing.
 *
 * The body region hosts, below the argument text, the contention's nested
 * {@link ./SubpointNode | subpoints}. A debater nests one by typing an `S#`
 * trigger inside this contention's editor - wired here via
 * {@link ./useSubpointTrigger}, which needs the raw editor instance (hence
 * {@link useDocumentEditor} + {@link EditorContent} rather than the
 * {@link DocumentEditor} component the contention used before subpoints landed).
 */
export function ContentionNode({ data }: NodeProps<HostedFlowNode>) {
  const context = useFlowSheet();
  const handle = context?.handle ?? null;
  const collapse = context?.collapse ?? null;
  const { flowNodeId, columnId } = data;

  const { label, side } = useContentionHeader(handle, columnId, flowNodeId);
  const classes = SIDE_CLASSES[side];
  const collapsed = collapse?.isCollapsed(flowNodeId) ?? false;

  // The raw editor is needed so the S# subpoint trigger can intercept keystrokes
  // and strip the typed token; the surface itself renders via EditorContent.
  const editor = useDocumentEditor({
    handle,
    fragment: contentionContentFragment(flowNodeId),
  });
  useSubpointTrigger(handle, flowNodeId, editor);

  const subpoints = useContentionSubpoints(handle, flowNodeId);

  // The header is the collapse toggle *and* marks this node active (the debater
  // is working on it) so "Collapse All Except Active" keeps it open. Collapsed,
  // the whole node is this single low bar; expanded, it sits above the body.
  const onHeaderClick = () => {
    collapse?.setActiveNodeId(flowNodeId);
    collapse?.toggleCollapsed(flowNodeId);
  };

  return (
    <div
      data-testid="contention-node"
      data-flow-node-id={flowNodeId}
      data-side={side}
      data-collapsed={collapsed || undefined}
      className={`flex h-full w-full flex-col overflow-hidden rounded-xl border-2 shadow-sm ${
        collapsed ? "" : "gap-2 p-card"
      } ${classes.container}`}
    >
      <button
        type="button"
        data-testid="contention-header"
        onClick={onHeaderClick}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand contention" : "Collapse contention"}
        className={`flex items-center gap-2 text-left text-sm font-semibold ${classes.header} ${
          collapsed ? "h-full w-full px-card" : ""
        }`}
      >
        <span aria-hidden="true" className="text-xs opacity-70">
          {collapsed ? "▸" : "▾"}
        </span>
        <span data-testid="contention-label">{label}</span>
      </button>
      {/* The argument text, then the nested subpoints below it. Hidden while the
          contention is collapsed to its bar. */}
      {!collapsed && (
        <div
          data-contention-body
          data-testid="contention-body"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto"
        >
          {handle && (
            <EditorContent
              editor={editor}
              onFocus={() => collapse?.setActiveNodeId(flowNodeId)}
              className="text-sm text-shell-text"
            />
          )}
          {subpoints.map((subpoint) => (
            <SubpointNode
              key={subpoint.id}
              contentionId={flowNodeId}
              subpointId={subpoint.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
