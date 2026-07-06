import { useState, type ReactNode } from "react";

import {
  createActiveSpeechDocStore,
  type ActiveSpeechDocStore,
} from "./active-speech-doc";
import { ActiveSpeechDocContext } from "./active-speech-doc-context";

/** Props for {@link ActiveSpeechDocProvider}. */
export interface ActiveSpeechDocProviderProps {
  children: ReactNode;
  /**
   * An existing store to adopt (tests, or a store wired elsewhere). Omit to have
   * the provider own one app-lifetime store created lazily (stable reference).
   */
  store?: ActiveSpeechDocStore;
}

/**
 * Owns the app-lifetime {@link ActiveSpeechDocStore} and publishes it on the
 * context, so every feature shares one notion of the active speech doc.
 *
 * The store is pure in-memory state (no network, no disk), so this provider is
 * safe on the boot path - it wraps the router alongside the other in-memory
 * providers in {@link ../App | App} without violating the local-first boot rule.
 */
export function ActiveSpeechDocProvider({
  children,
  store,
}: ActiveSpeechDocProviderProps) {
  const [created] = useState(() => createActiveSpeechDocStore());
  const value = store ?? created;
  return (
    <ActiveSpeechDocContext.Provider value={value}>
      {children}
    </ActiveSpeechDocContext.Provider>
  );
}
