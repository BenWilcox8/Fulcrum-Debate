import { useCallback, useState } from "react";

import {
  clampDockSize,
  type DockLayout,
  type DockPosition,
} from "./dock-layout";
import {
  readDockLayout,
  writeDockLayout,
  type DockLayoutStorage,
} from "./dock-layout-storage";

/** What {@link useDockLayout} returns. */
export interface UseDockLayoutResult {
  /** The live dock layout (dock edge + fractional size). */
  layout: DockLayout;
  /** Switches which edge the dock occupies; persisted immediately. */
  setPosition: (position: DockPosition) => void;
  /** Sets the dock pane's fraction (clamped); persisted immediately. */
  setSize: (size: number) => void;
}

/**
 * Reactive access to the persisted {@link DockLayout}, seeded synchronously from
 * local storage so the first paint already reflects the debater's saved
 * preference (no flash of the default, no async gate - upholding local-first
 * boot). Every mutation writes straight back through
 * {@link ./dock-layout-storage}, so the choice survives a reload.
 *
 * The initial read runs once in a lazy `useState` initializer. The `storage`
 * argument lets a test drive an isolated stub: omit it (or pass `undefined`) to
 * use the real `localStorage`; pass an explicit `null` to disable persistence
 * (pure in-memory behaviour).
 */
export function useDockLayout(
  storage?: DockLayoutStorage | null,
): UseDockLayoutResult {
  const [layout, setLayout] = useState<DockLayout>(() =>
    storage === undefined ? readDockLayout() : readDockLayout(storage),
  );

  const save = useCallback(
    (next: DockLayout) => {
      if (storage === undefined) writeDockLayout(next);
      else if (storage !== null) writeDockLayout(next, storage);
    },
    [storage],
  );

  const setPosition = useCallback(
    (position: DockPosition) => {
      const next = { ...layout, position };
      setLayout(next);
      save(next);
    },
    [layout, save],
  );

  const setSize = useCallback(
    (size: number) => {
      const next = { ...layout, size: clampDockSize(size) };
      setLayout(next);
      save(next);
    },
    [layout, save],
  );

  return { layout, setPosition, setSize };
}
