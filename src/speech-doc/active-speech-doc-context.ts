import { createContext, useContext } from "react";
import { useSyncExternalStore } from "react";

import {
  createActiveSpeechDocStore,
  type ActiveSpeechDocStore,
} from "./active-speech-doc";

/**
 * A private fallback store so consumers work **without** a provider (a bare
 * editor in a test, a subtree mounted outside the app shell). It is a real store
 * - setting the active id on it is harmless because nothing else reads it - so
 * the active-speech-doc hooks never throw for lack of a provider, mirroring the
 * formatting/tools "provider-tolerant reader" pattern. The app supplies the
 * shared store via {@link ./ActiveSpeechDocProvider}.
 */
const fallbackStore = createActiveSpeechDocStore();

/**
 * Carries the app-lifetime {@link ActiveSpeechDocStore}. Defaults to the private
 * fallback so the hooks are usable outside a provider.
 */
export const ActiveSpeechDocContext =
  createContext<ActiveSpeechDocStore>(fallbackStore);

/**
 * The shared {@link ActiveSpeechDocStore} for imperative use (e.g. a pipeline
 * reading `getActiveId()` outside React render). Returns the provider's store,
 * or the fallback when there is none.
 */
export function useActiveSpeechDocStore(): ActiveSpeechDocStore {
  return useContext(ActiveSpeechDocContext);
}

/** What {@link useActiveSpeechDoc} returns. */
export interface UseActiveSpeechDocResult {
  /** The active speech doc's document id, or `null` when none is active. */
  activeId: string | null;
  /** Sets (or clears with `null`) the active speech doc. */
  setActiveId: (id: string | null) => void;
}

/**
 * The reactive binding: reads the active speech doc id and re-renders whenever
 * it changes (via the store's own `subscribe` seam through
 * `useSyncExternalStore`, never a second event system), plus the setter. This is
 * how the editor marks itself active and how a pipeline surface observes the
 * current target.
 */
export function useActiveSpeechDoc(): UseActiveSpeechDocResult {
  const store = useActiveSpeechDocStore();
  const activeId = useSyncExternalStore(store.subscribe, store.getActiveId);
  return { activeId, setActiveId: store.setActiveId };
}
