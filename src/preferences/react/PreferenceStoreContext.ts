import { createContext } from "react";
import type { PreferenceStore } from "../store";

/**
 * Value exposed by {@link PreferenceStoreProvider} through the store hooks.
 *
 * Holds the one app-lifetime {@link PreferenceStore} against which feature
 * settings sections register. This is the shared home for the namespaced
 * section registry; it is distinct from the theme `PreferencesProvider`, which
 * owns the Rust-backed single-shape app preferences over the IPC seam.
 */
export interface PreferenceStoreContextValue {
  /** The single {@link PreferenceStore} every consumer registers/reads against. */
  store: PreferenceStore;
}

/**
 * Undefined outside a provider so {@link usePreferenceStore} can fail loudly
 * rather than hand back a throwaway store that no other consumer shares.
 */
export const PreferenceStoreContext = createContext<
  PreferenceStoreContextValue | undefined
>(undefined);
