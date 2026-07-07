/**
 * Transient per-heading selection state for the table of contents - the "include
 * this section" checkbox set the block-file speech pipeline sends from.
 *
 * A debater ticks one or more heading checkboxes in the ToC and sends every
 * checked section into their speech in one action. This hook owns exactly that
 * ephemeral selection: a set of the checked headings' ProseMirror positions, plus
 * the toggle/clear operations a checkbox column and a send button drive. It is a
 * moment-to-moment gesture, **never persisted** (a fresh session starts with
 * nothing checked), mirroring the flow sheet's transient send selection.
 *
 * ## Positions, not identities
 *
 * A heading has no stable id, so the selection is keyed by the ProseMirror
 * position the ToC outline reports for each heading - valid only against the
 * document version it was read from (see
 * {@link ../editor/headings/outline.OutlineHeading}). The ToC re-derives the
 * outline on every edit and renders the checkbox against the live position, so the
 * state a debater sees always matches the current document, and the send resolves
 * each position against the editor's current state at click time. This keeps the
 * selection a simple snapshot rather than a live-tracked identity map; a stale
 * position simply contributes nothing to a send.
 */
import { useCallback, useMemo, useState } from "react";

/** The selection controller a checkbox column and send button consume. */
export interface TocSelection {
  /** The checked headings' positions (a stable snapshot object per render). */
  readonly selectedPositions: ReadonlySet<number>;
  /** How many headings are currently checked. */
  readonly count: number;
  /** Whether the heading at `pos` is checked. */
  isSelected: (pos: number) => boolean;
  /** Toggle the heading at `pos` in or out of the selection. */
  toggle: (pos: number) => void;
  /** Clear the whole selection (e.g. after a successful send). */
  clear: () => void;
}

/**
 * Owns the ToC's transient per-heading checkbox selection. Returns a stable
 * {@link TocSelection} controller: `selectedPositions` re-references only when the
 * set changes, so consumers can memoise off it.
 */
export function useTocSelection(): TocSelection {
  const [selectedPositions, setSelectedPositions] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );

  const isSelected = useCallback(
    (pos: number) => selectedPositions.has(pos),
    [selectedPositions],
  );

  const toggle = useCallback((pos: number) => {
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedPositions((prev) => (prev.size === 0 ? prev : new Set<number>()));
  }, []);

  return useMemo(
    () => ({
      selectedPositions,
      count: selectedPositions.size,
      isSelected,
      toggle,
      clear,
    }),
    [selectedPositions, isSelected, toggle, clear],
  );
}
