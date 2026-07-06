/**
 * The shared React context for one editable flow sheet: the plumbing a custom
 * XYFlow node needs but cannot receive through XYFlow's plain-record node
 * `data`.
 *
 * XYFlow requires node data to be a serialisable record, so a node component
 * cannot be handed the live {@link DocumentHandle} (a class instance) or a
 * setter through it. This context carries those out-of-band: the open flow-sheet
 * `handle` (so a {@link ./ContentionNode} can bind its Tiptap surface and read
 * its rank live) and the **active column** selection that routes the C# trigger.
 * It is provided once around the canvas by {@link ./FlowSheetProvider} (composed
 * by {@link ./FlowSheetPanel}) and read by the column and contention nodes.
 *
 * It holds no document data of its own - the handle is the single source of
 * truth - only the transient UI selection (which column keystrokes flow into),
 * which is deliberately not persisted. The context object and its hook live in
 * this `.ts` module (no component export) so the provider component can live in
 * its own file, per the repo's context-splitting convention.
 */
import { createContext, useContext } from "react";

import type { DocumentHandle } from "../../documents/core";
import type { FlowCollapseState } from "./useFlowCollapse";

/** The value carried by {@link FlowSheetContext}. */
export interface FlowSheetContextValue {
  /** The open flow-sheet document, or `null` while it is still opening. */
  readonly handle: DocumentHandle | null;
  /**
   * The column the C# trigger currently routes into, or `null` when none is
   * active. A debater activates a column (by clicking it) before typing `C1`.
   */
  readonly activeColumnId: string | null;
  /** Sets (or clears, with `null`) the active column. */
  setActiveColumnId(id: string | null): void;
  /**
   * The transient collapse view-state for this sheet: which containers are
   * collapsed to a bar, the active node, and the "Collapse All Except Active"
   * operation. Never persisted (see {@link ./flow-collapse}).
   */
  readonly collapse: FlowCollapseState;
}

/**
 * `null` outside a {@link FlowSheetProvider} so a node kind rendered without the
 * provider (a bare canvas in a test, or a future render-only surface) degrades
 * gracefully via {@link useFlowSheet} rather than throwing.
 */
export const FlowSheetContext = createContext<FlowSheetContextValue | null>(
  null,
);

/**
 * Reads the {@link FlowSheetContextValue}. Returns `null` outside a
 * {@link FlowSheetProvider} - the provider-tolerant discipline used elsewhere in
 * the app, so a node rendered outside the provider still paints its chrome.
 */
export function useFlowSheet(): FlowSheetContextValue | null {
  return useContext(FlowSheetContext);
}
