import { useContext } from "react";
import {
  PreferencesContext,
  type PreferencesContextValue,
} from "./PreferencesContext";

/**
 * Accesses the current preferences and the updater from the nearest
 * {@link PreferencesProvider}. Throws when used outside a provider so the
 * mistake surfaces immediately instead of silently using unpersisted defaults.
 */
export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (value === undefined) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return value;
}
