import { describe, it, expect } from "vitest";

import type { FlowNode } from "../nodes";
import {
  flowNodesToNodes,
  flowNodeY,
  registryToNodeTypes,
  FLOW_NODE_HEIGHT,
  FLOW_NODE_INSET_X,
  FLOW_NODE_WIDTH,
  FLOW_NODE_TOP_INSET,
  FLOW_NODE_GAP,
  COLLAPSED_NODE_HEIGHT,
  type ColumnFlowNodes,
  type FlowNodeComponent,
  type FlowNodeRegistry,
} from "./node-host";

const node = (id: string, columnId: string, kind: string): FlowNode => ({
  id,
  columnId,
  kind,
});

// A trivial component stands in for a registered kind; the pure mapper never
// renders it, it only needs an entry in the registry.
const Stub: FlowNodeComponent = () => null;
const registry: FlowNodeRegistry = [{ kind: "stub", component: Stub }];

describe("flowNodesToNodes", () => {
  it("parents each node to its column and clips it to the column bounds", () => {
    const groups: ColumnFlowNodes[] = [
      { columnId: "col-1", nodes: [node("n1", "col-1", "stub")] },
    ];
    const [n] = flowNodesToNodes(groups, registry);

    expect(n.id).toBe("n1");
    expect(n.type).toBe("stub");
    expect(n.parentId).toBe("col-1");
    // Membership is visual too: the node is clipped to its column.
    expect(n.extent).toBe("parent");
    expect(n.data).toEqual({ flowNodeId: "n1", columnId: "col-1", kind: "stub" });
  });

  it("stacks a column's nodes vertically by their order in the list", () => {
    const groups: ColumnFlowNodes[] = [
      {
        columnId: "col-1",
        nodes: [
          node("a", "col-1", "stub"),
          node("b", "col-1", "stub"),
          node("c", "col-1", "stub"),
        ],
      },
    ];
    const nodes = flowNodesToNodes(groups, registry);

    expect(nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(nodes.map((n) => n.position.x)).toEqual([
      FLOW_NODE_INSET_X,
      FLOW_NODE_INSET_X,
      FLOW_NODE_INSET_X,
    ]);
    expect(nodes.map((n) => n.position.y)).toEqual([
      flowNodeY(0, FLOW_NODE_HEIGHT),
      flowNodeY(1, FLOW_NODE_HEIGHT),
      flowNodeY(2, FLOW_NODE_HEIGHT),
    ]);
    // Successive slots are one height + gap apart.
    expect(nodes[1].position.y - nodes[0].position.y).toBe(
      FLOW_NODE_HEIGHT + FLOW_NODE_GAP,
    );
    expect(nodes.every((n) => n.width === FLOW_NODE_WIDTH)).toBe(true);
    expect(nodes.every((n) => n.height === FLOW_NODE_HEIGHT)).toBe(true);
  });

  it("keeps each column's nodes independent across columns", () => {
    const groups: ColumnFlowNodes[] = [
      { columnId: "left", nodes: [node("l1", "left", "stub")] },
      { columnId: "right", nodes: [node("r1", "right", "stub")] },
    ];
    const nodes = flowNodesToNodes(groups, registry);

    expect(nodes.map((n) => n.parentId)).toEqual(["left", "right"]);
    // Both start at the same column-relative top slot.
    expect(nodes[0].position.y).toBe(nodes[1].position.y);
  });

  it("honours a per-kind slot height", () => {
    const tallRegistry: FlowNodeRegistry = [
      { kind: "tall", component: Stub, height: 200 },
    ];
    const groups: ColumnFlowNodes[] = [
      {
        columnId: "col-1",
        nodes: [node("a", "col-1", "tall"), node("b", "col-1", "tall")],
      },
    ];
    const nodes = flowNodesToNodes(groups, tallRegistry);

    expect(nodes[0].height).toBe(200);
    expect(nodes[1].position.y).toBe(flowNodeY(1, 200));
  });

  it("skips a node whose kind is not registered (no renderer)", () => {
    const groups: ColumnFlowNodes[] = [
      {
        columnId: "col-1",
        nodes: [node("a", "col-1", "stub"), node("b", "col-1", "unknown")],
      },
    ];
    const nodes = flowNodesToNodes(groups, registry);

    expect(nodes.map((n) => n.id)).toEqual(["a"]);
  });

  it("does not leave a phantom gap when a middle node is skipped", () => {
    const groups: ColumnFlowNodes[] = [
      {
        columnId: "col-1",
        nodes: [
          node("a", "col-1", "stub"),
          node("b", "col-1", "unknown"),
          node("c", "col-1", "stub"),
        ],
      },
    ];
    const nodes = flowNodesToNodes(groups, registry);

    expect(nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(nodes[0].position.y).toBe(FLOW_NODE_TOP_INSET);
    expect(nodes[1].position.y).toBe(FLOW_NODE_TOP_INSET + FLOW_NODE_HEIGHT + FLOW_NODE_GAP);
  });

  it("stacks mixed-height nodes by cumulative height, not uniform slots", () => {
    const mixedRegistry: FlowNodeRegistry = [
      { kind: "tall", component: Stub, height: 120 },
      { kind: "short", component: Stub, height: 40 },
    ];
    const groups: ColumnFlowNodes[] = [
      {
        columnId: "col-1",
        nodes: [
          node("a", "col-1", "tall"),
          node("b", "col-1", "short"),
        ],
      },
    ];
    const nodes = flowNodesToNodes(groups, mixedRegistry);

    expect(nodes[0].position.y).toBe(FLOW_NODE_TOP_INSET);
    expect(nodes[0].height).toBe(120);
    expect(nodes[1].position.y).toBe(FLOW_NODE_TOP_INSET + 120 + FLOW_NODE_GAP);
    expect(nodes[1].height).toBe(40);
  });

  it("shrinks a collapsed node to the minimal-height bar and reflows below it", () => {
    const tallRegistry: FlowNodeRegistry = [
      { kind: "tall", component: Stub, height: 160 },
    ];
    const groups: ColumnFlowNodes[] = [
      {
        columnId: "col-1",
        nodes: [
          node("a", "col-1", "tall"),
          node("b", "col-1", "tall"),
          node("c", "col-1", "tall"),
        ],
      },
    ];
    const nodes = flowNodesToNodes(groups, tallRegistry, {
      collapsedIds: new Set(["b"]),
    });

    // The collapsed node reads at the minimal bar height...
    expect(nodes[1].height).toBe(COLLAPSED_NODE_HEIGHT);
    expect(nodes[0].height).toBe(160);
    expect(nodes[2].height).toBe(160);
    // ...and the node below it moves up by the height it no longer occupies.
    expect(nodes[1].position.y).toBe(FLOW_NODE_TOP_INSET + 160 + FLOW_NODE_GAP);
    expect(nodes[2].position.y).toBe(
      FLOW_NODE_TOP_INSET + 160 + FLOW_NODE_GAP + COLLAPSED_NODE_HEIGHT + FLOW_NODE_GAP,
    );
  });

  it("leaves layout unchanged when no collapsedIds are supplied", () => {
    const groups: ColumnFlowNodes[] = [
      { columnId: "col-1", nodes: [node("a", "col-1", "stub")] },
    ];
    const [withNone] = flowNodesToNodes(groups, registry);
    const [withEmpty] = flowNodesToNodes(groups, registry, {
      collapsedIds: new Set(),
    });
    expect(withNone.height).toBe(FLOW_NODE_HEIGHT);
    expect(withEmpty.height).toBe(FLOW_NODE_HEIGHT);
  });

  it("marks nodes render-only (no drag, no selection) by default", () => {
    const groups: ColumnFlowNodes[] = [
      { columnId: "col-1", nodes: [node("a", "col-1", "stub")] },
    ];
    const [n] = flowNodesToNodes(groups, registry);
    expect(n.draggable).toBe(false);
    expect(n.selectable).toBe(false);
  });

  it("makes a kind declared `draggable` movable and unclipped so it can cross columns", () => {
    const DragStub: FlowNodeComponent = () => null;
    const draggableRegistry: FlowNodeRegistry = [
      { kind: "drag", component: DragStub, draggable: true },
    ];
    const groups: ColumnFlowNodes[] = [
      { columnId: "col-1", nodes: [node("a", "col-1", "drag")] },
    ];
    const [n] = flowNodesToNodes(groups, draggableRegistry);
    expect(n.draggable).toBe(true);
    // A draggable node must not be clipped to its column, or it could never be
    // dragged onto another one.
    expect(n.extent).toBeUndefined();
    // It still belongs to its column visually via parentId.
    expect(n.parentId).toBe("col-1");
  });

  it("returns no nodes for no groups or empty columns", () => {
    expect(flowNodesToNodes([], registry)).toEqual([]);
    expect(
      flowNodesToNodes([{ columnId: "col-1", nodes: [] }], registry),
    ).toEqual([]);
  });
});

describe("flowNodeY", () => {
  it("offsets the first node below the header and stacks by height + gap", () => {
    expect(flowNodeY(0, FLOW_NODE_HEIGHT)).toBe(FLOW_NODE_TOP_INSET);
    expect(flowNodeY(2, FLOW_NODE_HEIGHT)).toBe(
      FLOW_NODE_TOP_INSET + 2 * (FLOW_NODE_HEIGHT + FLOW_NODE_GAP),
    );
  });
});

describe("registryToNodeTypes", () => {
  it("maps each registered kind to its component", () => {
    const types = registryToNodeTypes(registry);
    expect(Object.keys(types)).toEqual(["stub"]);
    expect(types.stub).toBe(Stub);
  });

  it("is empty for an empty registry", () => {
    expect(registryToNodeTypes([])).toEqual({});
  });
});
