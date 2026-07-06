import { useEffect, useState } from "react";
import type { Edge } from "@xyflow/react";

import type { DocumentHandle } from "../../documents/core";
import { listEdges, observeEdges } from "../edges";
import { flowEdgesToEdges } from "./flow-edge";

/** A stable empty edge list so a nullish handle never allocates. */
const NO_EDGES: Edge[] = [];

/**
 * Subscribes to a flow sheet's edges and maps them to XYFlow edges (the
 * transparent cross-application arrows). The live seam between the flow-doc edge
 * model and the canvas: it drives {@link observeEdges} - a pure derivation that
 * fires on every change and once immediately - and feeds the result through the
 * pure {@link flowEdgesToEdges} mapping. A nullish handle yields an empty list,
 * so it is safe to call unconditionally while a document is still opening.
 *
 * Like {@link ./useFlowNodes}, it awaits nothing beyond the document layer's
 * local load: edges appear once IndexedDB has replayed into the doc, with no
 * network in the path.
 */
export function useFlowEdges(handle: DocumentHandle | null): Edge[] {
  const [edges, setEdges] = useState<Edge[]>(() =>
    handle ? flowEdgesToEdges(listEdges(handle)) : NO_EDGES,
  );

  useEffect(() => {
    if (!handle) {
      setEdges(NO_EDGES);
      return;
    }
    return observeEdges(handle, () => {
      setEdges(flowEdgesToEdges(listEdges(handle)));
    });
  }, [handle]);

  return edges;
}
