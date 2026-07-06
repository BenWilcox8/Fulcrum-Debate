import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  PanOnScrollMode,
  applyNodeChanges,
  type Node,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { DocumentHandle } from "../../documents/core";
import { SpeechColumnNode } from "./SpeechColumnNode";
import { SPEECH_COLUMN_NODE_TYPE } from "./column-nodes";
import { useColumnNodes } from "./useColumnNodes";
import { useFlowNodes } from "./useFlowNodes";
import { useFlowEdges } from "./useFlowEdges";
import { useFlowSheet } from "./flow-sheet-context";
import {
  resolveNodeDropColumn,
  resolveAdjacentNode,
  type DropColumn,
  type DropTargetNode,
} from "./flow-drag";
import {
  FLOW_NODE_WIDTH,
  FLOW_NODE_HEIGHT,
  registryToNodeTypes,
  type FlowNodeRegistry,
  type HostedFlowNode,
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
  /**
   * Called when a draggable flow node is dropped onto a *different* column than
   * the one it started in. The canvas resolves the drop geometrically and hands
   * back the node id, the source/target column ids, and - for the strike gesture
   * - the id of the target-column node the drop landed **adjacent** to (or `null`
   * when it was not next to any argument). The caller performs the cross-
   * application copy (see {@link ../cross-apply}) and, when an adjacent node is
   * given, strikes it (see {@link ../strike}). Omitted means drops are inert (the
   * node just snaps back). The canvas never mutates the document itself - it stays
   * a pure view over the flow model.
   */
  onNodeCrossColumnDrop?: (
    nodeId: string,
    fromColumnId: string,
    toColumnId: string,
    adjacentNodeId: string | null,
  ) => void;
  /** Class applied to the canvas's sizing wrapper. */
  className?: string;
}

/**
 * The flow-sheet canvas: an XYFlow surface rendering one full-height, side-
 * coloured column per flow-doc speech column, in document order, that pans
 * horizontally across more columns than fit the viewport, hosting the flow nodes
 * (contentions) inside those columns and the transparent cross-application
 * arrows between them.
 *
 * Columns, nodes, and edges come straight from the flow-sheet document model
 * (live through the `observe*` seams); the canvas is a view over that model and
 * never mutates it. The one interaction it owns is *drag*: a draggable node kind
 * can be dragged onto another column, and on drop the canvas resolves the target
 * column and calls {@link FlowCanvasProps.onNodeCrossColumnDrop} so the caller
 * performs the copy. Node positions are controlled locally during a drag (so it
 * is smooth) and re-synced from the document whenever the model changes, so a
 * dropped node snaps back to its computed slot and any newly-copied node appears
 * in place.
 *
 * Local-first: the surface renders with no async gate. Columns/nodes/edges are
 * populated by the observers once IndexedDB has loaded into the doc, so nothing
 * here awaits a network resource - the offline-boot rule holds.
 */
export function FlowCanvas({
  handle,
  flowNodeTypes = EMPTY_REGISTRY,
  onNodeCrossColumnDrop,
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

  // Collapse view-state lives on the flow-sheet context (provider-tolerant: a
  // bare render-only canvas has no provider, so nothing is collapsed). A
  // collapsed node lays out as a bar and its column reflows - see ./flow-collapse.
  const collapsedIds = useFlowSheet()?.collapse.collapsedNodeIds;

  const columnNodes = useColumnNodes(handle, height);
  const flowNodes = useFlowNodes(handle, flowNodeTypes, collapsedIds);
  const edges = useFlowEdges(handle);

  // Parents must precede their children in the node array (XYFlow requirement),
  // so column nodes come first, then the flow nodes hosted inside them. This is
  // the document-authoritative layout - the single source of truth for where a
  // node rests.
  const docNodes = useMemo<Node[]>(
    () => [...columnNodes, ...flowNodes],
    [columnNodes, flowNodes],
  );

  // Locally-controlled node state so a drag is smooth. It is re-seeded from the
  // document-authoritative layout whenever that changes (a copy landed, a node
  // was added/moved/collapsed), which is also what snaps a dropped node back to
  // its computed slot: a no-op drop leaves the doc unchanged, so we reset
  // explicitly on drag stop; a cross-column drop changes the doc, so the effect
  // re-seeds with the copy included.
  const [nodes, setNodes] = useState<Node[]>(docNodes);
  useEffect(() => {
    setNodes(docNodes);
  }, [docNodes]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  // The column layout the drop resolver needs, derived from the live column
  // nodes (ids + x-origin + width) so it always matches what is on screen.
  const dropColumns = useMemo<DropColumn[]>(
    () =>
      columnNodes.map((column) => ({
        id: column.id,
        x: column.position.x,
        width: column.width ?? 0,
      })),
    [columnNodes],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      const data = node.data as HostedFlowNode["data"] | undefined;
      const fromColumnId = data?.columnId;
      if (fromColumnId) {
        const toColumnId = resolveNodeDropColumn({
          sourceColumnId: fromColumnId,
          nodeRelX: node.position.x,
          nodeWidth: node.width ?? FLOW_NODE_WIDTH,
          columns: dropColumns,
        });
        if (toColumnId && toColumnId !== fromColumnId) {
          // Which of the target column's arguments did the drop land next to?
          // Vertical geometry: the dragged node's center against the target
          // column's laid-out node slots. `null` = not adjacent to any (copy
          // only, no strike). Coordinates are column-relative and every column
          // sits at y-origin 0, so the dragged node's `position.y` is directly
          // comparable to the target nodes' `position.y`.
          const centerY = node.position.y + (node.height ?? FLOW_NODE_HEIGHT) / 2;
          const targetNodes: DropTargetNode[] = flowNodes
            .filter((candidate) => candidate.parentId === toColumnId)
            .map((candidate) => ({
              id: candidate.id,
              y: candidate.position.y,
              height: candidate.height ?? FLOW_NODE_HEIGHT,
            }));
          const adjacentNodeId = resolveAdjacentNode(centerY, targetNodes);
          onNodeCrossColumnDrop?.(
            node.id,
            fromColumnId,
            toColumnId,
            adjacentNodeId,
          );
        }
      }
      // Always snap back to the document-authoritative layout: the source node
      // never moves (a cross-application only *copies*), and a no-op drop must
      // not leave the node where it was released.
      setNodes(docNodes);
    },
    [dropColumns, docNodes, flowNodes, onNodeCrossColumnDrop],
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
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
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
        // Per-node `draggable` governs: only a draggable flow-node kind moves;
        // columns and render-only kinds stay put. No connecting/selecting.
        nodesConnectable={false}
        elementsSelectable={false}
        // Keep all columns mounted regardless of measurement (jsdom has none).
        onlyRenderVisibleElements={false}
      />
    </div>
  );
}
