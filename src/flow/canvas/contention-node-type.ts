/**
 * The Contention container's registration with the canvas: the
 * {@link FlowNodeTypeDefinition} that teaches {@link ./FlowCanvas} to render a
 * {@link CONTENTION_KIND} node as a {@link ./ContentionNode}, plus a ready-made
 * single-kind registry the editable flow sheet passes as `flowNodeTypes`.
 *
 * This is the whole wiring a node kind needs (see the node-host contract): a
 * `kind` string, the component, and its slot height. A contention hosts a header
 * and a Tiptap surface, so its slot is taller than the default flow-node slot -
 * the "large" in "large, rounded container".
 */
import { CONTENTION_KIND } from "../contention";
import { ContentionNode } from "./ContentionNode";
import type {
  FlowNodeRegistry,
  FlowNodeTypeDefinition,
} from "./node-host";

/**
 * Height of a contention's vertical slot, in px - taller than the default
 * flow-node slot so the container is visibly large and leaves room for its
 * argument text (and, next slice, nested subpoints).
 */
export const CONTENTION_NODE_HEIGHT = 160;

/**
 * The contention node kind's registration with the canvas. Marked `draggable` so
 * a debater can drag a contention onto another column to cross-apply it (copy +
 * transparent arrow); the drop is resolved by {@link ./FlowCanvas} and performed
 * by {@link ../cross-apply}.
 */
export const CONTENTION_FLOW_NODE_TYPE: FlowNodeTypeDefinition = {
  kind: CONTENTION_KIND,
  component: ContentionNode,
  height: CONTENTION_NODE_HEIGHT,
  draggable: true,
};

/**
 * A stable single-kind registry to hand {@link ./FlowCanvas} via `flowNodeTypes`.
 * Module-level so passing it never re-renders the canvas.
 */
export const CONTENTION_FLOW_NODE_REGISTRY: FlowNodeRegistry = [
  CONTENTION_FLOW_NODE_TYPE,
];
