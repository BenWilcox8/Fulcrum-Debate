/**
 * Preferences feature module: a typed, persisted app-preferences store layered
 * on the IPC seam (`src/ipc`).
 *
 * - {@link PreferencesProvider} loads the store and provides it to the tree.
 * - {@link usePreferences} reads preferences and persists updates.
 *
 * Preference shapes (`Preferences`, `Theme`) live in `src/ipc` alongside the
 * typed commands that carry them across the seam.
 *
 * The namespaced, typed preference *store core* (`./store`) is the pure,
 * in-memory foundation that feature settings sections register against; it is
 * free of React and Tauri so persistence and React bindings can attach at its
 * seams. The reactive React bindings for that core live in `./react`:
 * {@link PreferenceStoreProvider} shares one store, and {@link useSection} /
 * {@link usePreferenceValue} give a component a live, typed read that
 * re-renders when a value is set anywhere.
 */
export { PreferencesProvider } from "./PreferencesProvider";
export { usePreferences } from "./usePreferences";
export type { PreferencesContextValue } from "./PreferencesContext";

export { createPreferenceStore } from "./store";
export type {
  PreferenceField,
  PreferenceStore,
  SectionDefinition,
  SectionHandle,
  SectionSchema,
  SectionValues,
} from "./store";

export {
  PreferenceStoreProvider,
  usePreferenceStore,
  useSection,
  usePreferenceValue,
} from "./react";
export type { PreferenceStoreContextValue } from "./react";
