import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  PanOnScrollMode,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { DocumentHandle } from "../../documents/core";
import { SpeechColumnNode } from "./SpeechColumnNode";
import { SPEECH_COLUMN_NODE_TYPE } from "./column-nodes";
import { useColumnNodes } from "./useColumnNodes";
import { useFlowNodes } from "./useFlowNodes";
import {
  registryToNodeTypes,
  type FlowNodeRegistry,
} from "./node-host";

/**
 * The built-in node types the canvas always renders. Registered flow-node kinds
 * (via `flowNodeTypes`) are merged on top of this.
 */
const BASE_NODE_TYPES: NodeTypes = {
  [SPEECH_COLUMN_NODE_TYPE]: SpeechColumnNode,
};

/** A stable empty registry so omitting `flowNodeTypes` never re-renders. */
const EMPTY_REGISTRY: FlowNodeRegistry = [];

/**
 * No edges are ever drawn on the flow sheet. A stable empty array keeps XYFlow
 * from treating each render as an edge-set change.
 */
const NO_EDGES: [] = [];

/**
 * Vertical panning is pinned to 0 so full-height columns always fill the
 * viewport top-to-bottom; only the horizontal axis is free, which is what lets
 * the canvas pan across more columns than fit. A large finite horizontal extent
 * keeps every column reachable without relying on `Infinity`.
 */
const HORIZONTAL_PAN_EXTENT: [[number, number], [number, number]] = [
  [-100_000, 0],
  [100_000, 0],
];

/** Props for {@link FlowCanvas}. */
export interface FlowCanvasProps {
  /**
   * The flow-sheet document to render. `null` while the document is opening -
   * the canvas paints its (empty) surface synchronously and fills in columns
   * once the handle's local load resolves and the observer fires.
   */
  handle: DocumentHandle | null;
  /**
   * The flow-node kinds this canvas can host inside its columns. Each definition
   * registers a `kind` and the component that renders it; the canvas builds its
   * XYFlow node types and child-node layout from this registry, so a later PRD
   * adds a node kind purely by passing it here - no canvas edits. Omitted means
   * columns only (the render-only default).
   */
  flowNodeTypes?: FlowNodeRegistry;
  /** Class applied to the canvas's sizing wrapper. */
  className?: string;
}

/**
 * The flow-sheet canvas: an XYFlow surface rendering one full-height, side-
 * coloured column per flow-doc speech column, in document order, that pans
 * horizontally across more columns than fit the viewport.
 *
 * It is render-only. Columns come straight from the flow-sheet document model
 * via {@link useColumnNodes} (live through `observeColumns`); this component
 * adds no column-editing UI and no flow-node content - those are separate tasks
 * that build on the container seam each {@link SpeechColumnNode} exposes.
 *
 * Local-first: the surface renders with no async gate. Columns are populated by
 * the observer once IndexedDB has loaded into the doc, so nothing here awaits a
 * network resource - the offline-boot rule holds.
 */
export function FlowCanvas({
  handle,
  flowNodeTypes = EMPTY_REGISTRY,
  className,
}: FlowCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  // Measure the viewport so columns fill it top-to-bottom. Purely a rendering
  // concern; it never gates when columns appear.
  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.height;
      if (measured) setHeight(measured);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columnNodes = useColumnNodes(handle, height);
  const flowNodes = useFlowNodes(handle, flowNodeTypes);

  // Parents must precede their children in the node array (XYFlow requirement),
  // so column nodes come first, then the flow nodes hosted inside them.
  const nodes = useMemo(
    () => [...columnNodes, ...flowNodes],
    [columnNodes, flowNodes],
  );

  const nodeTypes = useMemo(
    () => ({ ...BASE_NODE_TYPES, ...registryToNodeTypes(flowNodeTypes) }),
    [flowNodeTypes],
  );

  return (
    <div
      ref={wrapperRef}
      data-testid="flow-canvas"
      className={`h-full w-full bg-shell-bg ${className ?? ""}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={NO_EDGES}
        nodeTypes={nodeTypes}
        // Horizontal-only navigation: scroll pans sideways, vertical is pinned
        // so full-height columns stay fully in view.
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Horizontal}
        panOnDrag
        translateExtent={HORIZONTAL_PAN_EXTENT}
        // Lock zoom so column heights stay 1:1 with the viewport.
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        minZoom={1}
        maxZoom={1}
        // Render-only surface.
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        // Keep all columns mounted regardless of measurement (jsdom has none).
        onlyRenderVisibleElements={false}
      />
    </div>
  );
}
