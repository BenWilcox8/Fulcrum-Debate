import { useCallback, useRef, useSyncExternalStore } from "react";
import type {
  SectionHandle,
  SectionSchema,
  SectionValues,
} from "../store";

/**
 * Subscribes a component to one preference section and returns its live typed
 * snapshot. The component re-renders whenever any of the section's values is
 * set or reset - including by another consumer - so settings apply without a
 * restart.
 *
 * Reactivity rides the section's own `subscribe` seam through
 * {@link useSyncExternalStore}; no second event system is introduced. The
 * snapshot the store hands each notification is cached and returned as-is, so
 * the reference is stable between notifications (React bails out of a re-render
 * when nothing changed) while still being a fresh clone each time the store
 * mutates.
 */
export function useSection<S extends SectionSchema>(
  handle: SectionHandle<S>,
): SectionValues<S> {
  // The cached snapshot `useSyncExternalStore` reads. `getAll()` allocates a new
  // object on every call, so we must not call it from `getSnapshot` directly -
  // that would report a change on every render and loop. Instead we refresh the
  // cache only when the store notifies (or when the handle changes).
  const cache = useRef<{
    handle: SectionHandle<S>;
    snapshot: SectionValues<S>;
  } | null>(null);
  if (cache.current === null || cache.current.handle !== handle) {
    cache.current = { handle, snapshot: handle.getAll() };
  }

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // Re-read once on (re)subscribe in case a set slipped in between render
      // and effect; `useSyncExternalStore` compares the refreshed snapshot and
      // re-renders if it diverged from the render-time one.
      cache.current = { handle, snapshot: handle.getAll() };
      return handle.subscribe((snapshot) => {
        cache.current = { handle, snapshot };
        onStoreChange();
      });
    },
    [handle],
  );

  const getSnapshot = useCallback(() => cache.current!.snapshot, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Reads one typed key from a preference section and re-renders when it changes.
 *
 * A thin selector over {@link useSection}: it returns the value from the shared,
 * reference-stable section snapshot, so an object-valued key stays referentially
 * stable between notifications. Because the store notifies per section, the
 * component wakes on any set within the section; the returned value is still the
 * correct current value for `key`.
 */
export function usePreferenceValue<S extends SectionSchema, K extends keyof S>(
  handle: SectionHandle<S>,
  key: K,
): SectionValues<S>[K] {
  return useSection(handle)[key];
}
