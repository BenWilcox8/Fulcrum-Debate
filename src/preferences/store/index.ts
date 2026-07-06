/**
 * The namespaced, typed preference store core - the pure, in-memory foundation
 * of the preferences home. It has no React or Tauri dependency; persistence
 * attaches via {@link openPreferenceStore} (this module) and React bindings
 * attach at the {@link SectionHandle} subscription seam in `src/preferences/react/`.
 */
export { createPreferenceStore } from "./store";
export {
  openPreferenceStore,
  PREFERENCES_DB_NAME,
  type PersistentPreferenceStore,
} from "./persistence";
export type {
  PreferenceField,
  PreferenceStore,
  SectionDefinition,
  SectionHandle,
  SectionSchema,
  SectionValues,
} from "./types";
