/**
 * Reactive React bindings for the namespaced preference store (slice 3 of the
 * Settings Shell & Preferences Store feature).
 *
 * - {@link PreferenceStoreProvider} owns one app-lifetime {@link PreferenceStore}
 *   and provides it to the tree.
 * - {@link usePreferenceStore} hands back that shared store so a feature can
 *   register its section(s).
 * - {@link useSection} subscribes a component to a section's live typed snapshot;
 *   {@link usePreferenceValue} selects a single typed key.
 *
 * Everything composes the store's own `subscribe` seam via
 * `useSyncExternalStore`; no second event system is added. This is distinct from
 * the theme `PreferencesProvider` / `usePreferences` (the Rust-owned app store
 * over IPC), which is unchanged.
 */
export { PreferenceStoreProvider } from "./PreferenceStoreProvider";
export { usePreferenceStore } from "./usePreferenceStore";
export { useSection, usePreferenceValue } from "./useSection";
export type { PreferenceStoreContextValue } from "./PreferenceStoreContext";
