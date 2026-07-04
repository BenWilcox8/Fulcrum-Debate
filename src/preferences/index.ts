/**
 * Preferences feature module: a typed, persisted app-preferences store layered
 * on the IPC seam (`src/ipc`).
 *
 * - {@link PreferencesProvider} loads the store and provides it to the tree.
 * - {@link usePreferences} reads preferences and persists updates.
 *
 * Preference shapes (`Preferences`, `Theme`) live in `src/ipc` alongside the
 * typed commands that carry them across the seam.
 */
export { PreferencesProvider } from "./PreferencesProvider";
export { usePreferences } from "./usePreferences";
export type { PreferencesContextValue } from "./PreferencesContext";
