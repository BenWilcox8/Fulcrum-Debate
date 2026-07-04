import { createContext } from "react";
import type { Preferences } from "../ipc";

/** Value exposed by {@link PreferencesProvider} through {@link usePreferences}. */
export interface PreferencesContextValue {
  /** The current preferences. Starts at typed defaults, then reflects the store. */
  preferences: Preferences;
  /**
   * `true` until the persisted store has been read once. The defaults are
   * usable during this window, so consumers rarely need to block on it.
   */
  loading: boolean;
  /**
   * Persists a partial update, merges it into local state, and resolves once
   * the store write completes. Rejects if the write fails, leaving local state
   * untouched.
   */
  updatePreferences: (patch: Partial<Preferences>) => Promise<void>;
}

/**
 * Undefined outside a provider so {@link usePreferences} can fail loudly rather
 * than hand back a silent default that would never persist.
 */
export const PreferencesContext = createContext<PreferencesContextValue | undefined>(
  undefined,
);
