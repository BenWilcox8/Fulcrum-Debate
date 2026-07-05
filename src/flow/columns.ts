/**
 * The flow-sheet speech-column model for Fulcrum Debate.
 *
 * A flow sheet (document {@link DocumentKind | kind} `"flow-sheet"`) is the
 * canvas a debater flows a round on. Its spine is an **ordered list of speech
 * columns** - one column per speech of the round - and this module is that spine
 * and nothing else: the Yjs shared-type layout that stores the columns plus the
 * public helpers to add, relabel, reorder, and remove them, and a live
 * observe seam the upcoming canvas subscribes to.
 *
 * The flow *nodes* a column eventually holds (contentions, subpoints, responses)
 * are deliberately out of scope; they are later PRDs. This layer only fixes the
 * column list so those PRDs have stable columns to attach nodes to.
 *
 * ## Where the columns live (fragment convention)
 *
 * Per the document-model contract (see AGENTS.md), a kind's content lives under
 * named top-level shared types ("fragments") on the document's `Y.Doc`, and each
 * fragment is owned by exactly one PRD. This PRD claims one fragment on the
 * `flow-sheet` kind:
 *
 * | Fragment | Yjs type | Meaning |
 * |---|---|---|
 * | `columns` | `Y.Array<Y.Map>` | Ordered speech columns; each map is one {@link SpeechColumn}. |
 *
 * A later flow-node PRD claims a *new* fragment name for node content; it never
 * repurposes `columns`. Yjs binds `columns` to `Y.Array` for the life of the
 * document, so it must never be re-typed or renamed.
 *
 * ## Column identity
 *
 * Each column carries a stable {@link SpeechColumn.id | id} (a `crypto.randomUUID`
 * minted at creation) that is **the** reference later flow nodes use to say which
 * column they belong to. The id is immutable for the life of the column: reorder
 * and relabel preserve it, and it survives persistence/reload. Removing a column
 * retires its id permanently. Because node PRDs will foreign-key against these
 * ids, never reuse or fabricate one outside {@link addColumn}.
 *
 * ## Local-first, never network
 *
 * Helpers mutate Yjs shared types on `handle.doc`, which the document layer
 * persists to IndexedDB - so every change survives a reload with no network
 * involved. Edits also flow through the document's `update` stream, so a
 * registry that `track`s the handle bumps its last-edited time automatically;
 * this module never touches the registry itself.
 */
import * as Y from "yjs";

import type { DocumentHandle } from "../documents/core";

/** Top-level `Y.Array` fragment name holding the ordered speech columns. */
export const FLOW_COLUMNS_FRAGMENT = "columns";

/** Field keys inside a single column's nested `Y.Map`. */
const FIELD = {
  id: "id",
  label: "label",
  side: "side",
} as const;

/**
 * Which debate side a speech column belongs to.
 *
 * A flow sheet interleaves the two sides' speeches; every column is anchored to
 * one so the canvas can colour and group it (the `aff`/`neg` design tokens).
 */
export type FlowSide = "aff" | "neg";

/** The runtime list of valid {@link FlowSide} values. */
export const FLOW_SIDES = ["aff", "neg"] as const;

/** Type guard: is `value` a known {@link FlowSide}? */
export function isFlowSide(value: unknown): value is FlowSide {
  return value === "aff" || value === "neg";
}

/**
 * One speech column on a flow sheet - the plain read model returned by the
 * helpers here. It is a snapshot: mutating it does not touch the document (use
 * the helpers for that).
 */
export interface SpeechColumn {
  /**
   * Stable, unique column id. Minted by {@link addColumn}, immutable for the
   * life of the column, and the reference later flow nodes use to name their
   * column. Never reuse or fabricate one.
   */
  readonly id: string;
  /** Human-facing label shown on the column header (e.g. "1AC", "1NC"). */
  readonly label: string;
  /** The debate side this column belongs to. */
  readonly side: FlowSide;
}

/** Fields accepted when adding a new column; the id is minted, not supplied. */
export interface AddColumnInput {
  /** The debate side the new column belongs to. */
  side: FlowSide;
  /** Initial column label. */
  label: string;
}

/**
 * Returns the document's top-level `columns` `Y.Array`. Accessing it binds the
 * name as a `Y.Array` for the life of the doc (the fragment convention), so this
 * is the *only* accessor used on `columns`.
 */
function columnsArray(doc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return doc.getArray<Y.Map<unknown>>(FLOW_COLUMNS_FRAGMENT);
}

/** Reads a column's nested `Y.Map` into a plain {@link SpeechColumn} snapshot. */
function readColumn(map: Y.Map<unknown>): SpeechColumn {
  return {
    id: map.get(FIELD.id) as string,
    label: map.get(FIELD.label) as string,
    side: map.get(FIELD.side) as FlowSide,
  };
}

/** Builds a fresh, unintegrated `Y.Map` for a column from its plain fields. */
function makeColumnMap(column: SpeechColumn): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set(FIELD.id, column.id);
  map.set(FIELD.label, column.label);
  map.set(FIELD.side, column.side);
  return map;
}

/** Finds the array index of the column with `id`, or `-1` if absent. */
function indexOfColumn(array: Y.Array<Y.Map<unknown>>, id: string): number {
  for (let i = 0; i < array.length; i++) {
    if (array.get(i).get(FIELD.id) === id) return i;
  }
  return -1;
}

/**
 * The ordered list of speech columns on a flow-sheet document, as plain
 * snapshots in document order. A pure read of current state; safe to call any
 * time after the handle's local load has resolved.
 */
export function listColumns(handle: DocumentHandle): SpeechColumn[] {
  return columnsArray(handle.doc).map(readColumn);
}

/** The column with `id`, or `undefined` if none exists. */
export function getColumn(
  handle: DocumentHandle,
  id: string,
): SpeechColumn | undefined {
  const array = columnsArray(handle.doc);
  const index = indexOfColumn(array, id);
  return index === -1 ? undefined : readColumn(array.get(index));
}

/**
 * Appends a new speech column with a freshly minted id and returns it. Written
 * in one transaction so observers never see a half-built column.
 */
export function addColumn(
  handle: DocumentHandle,
  input: AddColumnInput,
): SpeechColumn {
  const column: SpeechColumn = {
    id: crypto.randomUUID(),
    label: input.label,
    side: input.side,
  };
  const array = columnsArray(handle.doc);
  handle.doc.transact(() => {
    array.push([makeColumnMap(column)]);
  });
  return column;
}

/**
 * Sets the label of the column with `id`. Throws if no such column exists. The
 * column keeps its id, side, and position.
 */
export function relabelColumn(
  handle: DocumentHandle,
  id: string,
  label: string,
): SpeechColumn {
  const array = columnsArray(handle.doc);
  const index = indexOfColumn(array, id);
  if (index === -1) {
    throw new Error(`relabelColumn: no column with id "${id}"`);
  }
  const map = array.get(index);
  map.set(FIELD.label, label);
  return readColumn(map);
}

/**
 * Moves the column with `id` to `toIndex` in the ordered list, shifting the
 * others to fill the gap. `toIndex` is clamped to a valid position, so a
 * canvas drag can pass a raw drop index. Throws if no such column exists; a
 * no-op move (already at the clamped target) leaves the document untouched.
 *
 * Yjs cannot re-position an already-integrated `Y.Map`, so the moved column is
 * rebuilt (same id/label/side) at the new index within one transaction. Its id
 * is preserved, so any references to it stay valid.
 */
export function moveColumn(
  handle: DocumentHandle,
  id: string,
  toIndex: number,
): void {
  const array = columnsArray(handle.doc);
  const from = indexOfColumn(array, id);
  if (from === -1) {
    throw new Error(`moveColumn: no column with id "${id}"`);
  }
  // Clamp to the current bounds so a stray drop index can't throw or drop the
  // column off the ends of the list.
  const to = Math.max(0, Math.min(toIndex, array.length - 1));
  if (to === from) return;

  const column = readColumn(array.get(from));
  handle.doc.transact(() => {
    array.delete(from, 1);
    // After the delete the target index still refers to the intended final
    // slot (indices at/after `from` shifted down by one), so inserting at `to`
    // lands the column exactly where the caller asked.
    array.insert(to, [makeColumnMap(column)]);
  });
}

/** Removes the column with `id`. A no-op if no such column exists. */
export function removeColumn(handle: DocumentHandle, id: string): void {
  const array = columnsArray(handle.doc);
  const index = indexOfColumn(array, id);
  if (index === -1) return;
  array.delete(index, 1);
}

/**
 * Subscribes to a flow sheet's column list: invokes `listener` with a fresh
 * ordered snapshot immediately and again after every change to the columns -
 * add, relabel, reorder, or remove. Returns an unsubscribe function.
 *
 * This is the seam the canvas consumes. Like the heading outline's
 * `observeOutline`, the snapshot is a pure derivation of current state
 * ({@link listColumns}), so the consumer never has to know *when* to recompute
 * or manage invalidation. Changes deeper than the column list (fragments a
 * later node PRD adds) do not fire it, because it observes only the `columns`
 * array.
 */
export function observeColumns(
  handle: DocumentHandle,
  listener: (columns: SpeechColumn[]) => void,
): () => void {
  const array = columnsArray(handle.doc);
  const emit = () => listener(array.map(readColumn));
  // observeDeep so a relabel (a change inside a nested column map) fires too,
  // not just structural add/remove/reorder on the array itself.
  const observer = () => emit();
  array.observeDeep(observer);
  emit();
  return () => array.unobserveDeep(observer);
}
