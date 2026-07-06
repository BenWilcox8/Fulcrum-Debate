/**
 * The namespaced, typed preference store core - the pure, in-memory foundation
 * of the preferences home. It has no React or Tauri dependency; persistence and
 * React bindings attach at the {@link SectionHandle} subscription seam in later
 * slices.
 */
export { createPreferenceStore } from "./store";
export type {
  PreferenceField,
  PreferenceStore,
  SectionDefinition,
  SectionHandle,
  SectionSchema,
  SectionValues,
} from "./types";
