/**
 * The flow-node **hosting seam** for the canvas: the pure translation from the
 * flow-doc node model ({@link ../nodes}) to XYFlow child nodes, plus the public
 * registry API a later PRD uses to teach the canvas a new node kind.
 *
 * The canvas ({@link ./FlowCanvas}) renders speech columns as XYFlow container
 * nodes; this module is how *flow nodes* live inside those columns. A registered
 * node kind renders as an XYFlow **child node** parented to its column node
 * (`parentId` = the column id, `extent: "parent"` so it is clipped to the
 * column's bounds), positioned by the flow-doc membership/order - never by
 * transient XYFlow state. That parent/child mechanism is what keeps a node
 * visually inside its column while the flow doc stays the single source of truth
 * for which column it belongs to and where it sits.
 *
 * ## Two-layer split (as with the column mapping)
 *
 * XYFlow measures the DOM, which does not run under jsdom, so the model -> node
 * translation is a **pure** function here ({@link flowNodesToNodes}) kept apart
 * from the `<ReactFlow>` wiring and the live hook ({@link ./useFlowNodes}). Child
 * position is a pure function of vertical rank - it needs no measurement, because
 * a child's coordinates are relative to its parent column, not the canvas.
 *
 * ## The registration API (extensible without touching canvas internals)
 *
 * A later PRD adds a node kind by handing the canvas a
 * {@link FlowNodeTypeDefinition} - a `kind` string (matching {@link FlowNode.kind})
 * and the component that renders it - via {@link FlowCanvas}'s `flowNodeTypes`
 * prop. It never edits this module or the canvas: the canvas builds its XYFlow
 * `nodeTypes` and its child-node layout straight from the registry. A node kind
 * with no registered definition is skipped (it cannot be rendered), so an
 * unknown or orphaned node never crashes the surface.
 */
import type { ComponentType } from "react";
import type { Node, NodeProps, NodeTypes } from "@xyflow/react";

import type { FlowNode } from "../nodes";
import { COLUMN_WIDTH } from "./column-nodes";

/** Horizontal inset of a flow node from its column's left edge, in px. */
export const FLOW_NODE_INSET_X = 12;

/**
 * Width of a hosted flow node, in px: the column width inset on both sides so
 * the node sits within its column's padding.
 */
export const FLOW_NODE_WIDTH = COLUMN_WIDTH - 2 * FLOW_NODE_INSET_X;

/**
 * Vertical offset of the first flow node from the column's top, in px. Leaves
 * room for the column header the {@link ./SpeechColumnNode} renders.
 */
export const FLOW_NODE_TOP_INSET = 48;

/** Default height of one flow node's vertical slot, in px. */
export const FLOW_NODE_HEIGHT = 96;

/**
 * Height of a **collapsed** flow node's slot, in px: a single low horizontal bar
 * that reads its label at a glance and no more. When a node's id is in the
 * collapsed set ({@link FlowNodeLayoutOptions.collapsedIds}) it takes this height
 * regardless of its kind's normal slot, and the nodes below it reflow up.
 */
export const COLLAPSED_NODE_HEIGHT = 40;

/** Vertical gap between stacked flow nodes in a column, in px. */
export const FLOW_NODE_GAP = 8;

/**
 * The data XYFlow carries on a hosted flow node. XYFlow requires node data to be
 * a plain record; this is the node's identity snapshot (its id lives on the node
 * `id` too - the canonical handle). A node kind reads its own *content* from the
 * flow document by this id, not from here, so this stays a thin, stable shape.
 */
export interface FlowNodeData extends Record<string, unknown> {
  /** The flow-doc node id (same as the XYFlow node `id`). */
  readonly flowNodeId: string;
  /** The id of the column this node belongs to (its XYFlow `parentId`). */
  readonly columnId: string;
  /** The node kind, matching the registered definition that renders it. */
  readonly kind: string;
}

/** A fully-typed XYFlow child node for one hosted flow node. */
export type HostedFlowNode = Node<FlowNodeData>;

/**
 * The React component that renders one flow node of a given kind - a standard
 * XYFlow custom node, receiving {@link FlowNodeData}. A node kind implements this
 * and registers it via {@link FlowNodeTypeDefinition}.
 */
export type FlowNodeComponent = ComponentType<NodeProps<HostedFlowNode>>;

/**
 * A node kind's registration with the canvas: its {@link FlowNode.kind}
 * discriminator, the component that renders it, and an optional slot height.
 * This is the whole public contract a later PRD implements to add a node kind.
 */
export interface FlowNodeTypeDefinition {
  /** The kind discriminator, matching {@link FlowNode.kind} on stored nodes. */
  readonly kind: string;
  /** The custom XYFlow node component that renders this kind. */
  readonly component: FlowNodeComponent;
  /**
   * Height of this kind's vertical slot, in px. Defaults to
   * {@link FLOW_NODE_HEIGHT}. Fixed per kind for now - resizable nodes are a
   * later concern.
   */
  readonly height?: number;
}

/**
 * The set of node kinds a canvas knows how to render, as a list of definitions.
 * A list (not a map) so a PRD registers by spreading its definition in; the
 * canvas indexes it by kind internally.
 */
export type FlowNodeRegistry = readonly FlowNodeTypeDefinition[];

/**
 * Layout-time options for {@link flowNodesToNodes}. Optional so existing callers
 * (and tests) can omit it entirely for the uncollapsed default.
 */
export interface FlowNodeLayoutOptions {
  /**
   * The ids of nodes currently **collapsed** to a bar. A node in this set is laid
   * out at {@link COLLAPSED_NODE_HEIGHT} instead of its kind's slot height, and
   * the nodes below it in the same column reflow up. This is transient view-state
   * (see {@link ./flow-collapse}); it never touches the flow document.
   */
  readonly collapsedIds?: ReadonlySet<string>;
}

/** A column's nodes in vertical order (top-first) - the unit the mapper lays out. */
export interface ColumnFlowNodes {
  /** The column id these nodes belong to (their shared XYFlow `parentId`). */
  readonly columnId: string;
  /** The column's nodes, already in vertical order (as {@link listColumnNodes}). */
  readonly nodes: readonly FlowNode[];
}

/** Indexes a {@link FlowNodeRegistry} by kind for O(1) lookup. */
function indexRegistry(
  registry: FlowNodeRegistry,
): Map<string, FlowNodeTypeDefinition> {
  return new Map(registry.map((def) => [def.kind, def]));
}

/**
 * Builds the XYFlow `nodeTypes` fragment for the registered flow-node kinds -
 * the canvas merges this with its own `speechColumn` type. Keeping it here means
 * the canvas never enumerates kinds itself.
 */
export function registryToNodeTypes(registry: FlowNodeRegistry): NodeTypes {
  const types: NodeTypes = {};
  for (const def of registry) {
    types[def.kind] = def.component as NodeTypes[string];
  }
  return types;
}

/**
 * The y-origin of the flow node at vertical rank `index` within its column, in
 * column-relative px. A pure function of rank and the per-kind slot height - no
 * measurement, because child coordinates are relative to the parent column.
 */
export function flowNodeY(index: number, height: number): number {
  return FLOW_NODE_TOP_INSET + index * (height + FLOW_NODE_GAP);
}

/**
 * Translates each column's ordered flow nodes into XYFlow child nodes parented
 * to their column. Pure: given the same groups and registry it returns
 * structurally identical nodes, with no dependence on the DOM.
 *
 * - **Membership** becomes `parentId` = the column id, with `extent: "parent"`
 *   so XYFlow clips the node to its column's bounds.
 * - **Vertical order** becomes the y-offset via {@link flowNodeY}, from the
 *   node's index in its (already-ordered) column list.
 * - A node whose `kind` is not in the registry is **skipped** - it has no
 *   component to render, so an unknown/legacy kind degrades gracefully instead
 *   of crashing the surface.
 *
 * Nodes are render-only (non-draggable, non-selectable): this contract ships no
 * drag or editing gestures.
 *
 * A node whose id is in `options.collapsedIds` is laid out at
 * {@link COLLAPSED_NODE_HEIGHT} (a single bar) instead of its kind's slot height,
 * and the nodes below it reflow up - the layout side of the collapse view-state.
 */
export function flowNodesToNodes(
  groups: readonly ColumnFlowNodes[],
  registry: FlowNodeRegistry,
  options: FlowNodeLayoutOptions = {},
): HostedFlowNode[] {
  const byKind = indexRegistry(registry);
  const collapsedIds = options.collapsedIds;
  const out: HostedFlowNode[] = [];
  for (const { columnId, nodes } of groups) {
    let y = FLOW_NODE_TOP_INSET;
    for (const node of nodes) {
      const def = byKind.get(node.kind);
      if (!def) continue; // No registered renderer for this kind: skip it.
      const height = collapsedIds?.has(node.id)
        ? COLLAPSED_NODE_HEIGHT
        : def.height ?? FLOW_NODE_HEIGHT;
      out.push({
        id: node.id,
        type: node.kind,
        parentId: columnId,
        // Clip the node to its column's bounds - membership is visual, too.
        extent: "parent",
        position: { x: FLOW_NODE_INSET_X, y },
        width: FLOW_NODE_WIDTH,
        height,
        data: { flowNodeId: node.id, columnId, kind: node.kind },
        draggable: false,
        selectable: false,
      });
      y += height + FLOW_NODE_GAP;
    }
  }
  return out;
}
