import { useContext } from "react";
import type { PreferenceStore } from "../store";
import { PreferenceStoreContext } from "./PreferenceStoreContext";

/**
 * Accesses the app's shared {@link PreferenceStore} from the nearest
 * {@link PreferenceStoreProvider}. Throws when used outside a provider so the
 * mistake surfaces immediately instead of silently registering sections against
 * an orphan store nothing else can read.
 */
export function usePreferenceStore(): PreferenceStore {
  const value = useContext(PreferenceStoreContext);
  if (value === undefined) {
    throw new Error(
      "usePreferenceStore must be used within a PreferenceStoreProvider",
    );
  }
  return value.store;
}
