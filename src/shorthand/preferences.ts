/**
 * Registers the shorthand **scope** as a section on the shared preference store,
 * so where expansion runs (flow / speech / both / neither) is a persisted,
 * user-editable setting - the gate every surface reads before invoking the engine.
 *
 * The section holds one field, `scope`, an enumerated {@link ShorthandScope}
 * defaulting to {@link DEFAULT_SHORTHAND_SCOPE}. Its `options` metadata lets the
 * generic schema-driven Settings panel render a select with no bespoke UI, exactly
 * like the card-cutting tools' sections. This module only wires the model to the
 * store; the surface-generic gate itself lives in {@link ./scope}.
 */
import type {
  PreferenceField,
  PreferenceStore,
  SectionDefinition,
  SectionHandle,
} from "../preferences";
import {
  DEFAULT_SHORTHAND_SCOPE,
  SHORTHAND_SCOPES,
  type ShorthandScope,
} from "./scope";

/** The well-known store id for the shorthand section. */
export const SHORTHAND_SECTION_ID = "shorthand";

/** The scope field's key within the section. */
export const SHORTHAND_SCOPE_KEY = "scope";

/**
 * The section fields: a single enumerated `scope` field. `satisfies` keeps the
 * literal key exact while checking the field is a `PreferenceField<ShorthandScope>`
 * (with its default widened to the union so any scope can be `set`). The `options`
 * list is what the schema-driven panel renders as a select.
 */
const shorthandFields = {
  scope: {
    default: DEFAULT_SHORTHAND_SCOPE as ShorthandScope,
    label: "Expansion scope",
    description:
      "Where typed abbreviations expand on Enter / Shift+Enter: the flow sheet, a speech document, both, or neither.",
    options: SHORTHAND_SCOPES,
  },
} satisfies Record<string, PreferenceField<ShorthandScope>>;

/** The shorthand section's schema type (its exact keys and value types). */
export type ShorthandSectionSchema = typeof shorthandFields;

/** The typed handle to a registered shorthand section. */
export type ShorthandSectionHandle = SectionHandle<ShorthandSectionSchema>;

/** The section definition registered against the preference store. */
export const shorthandSectionDefinition: SectionDefinition<ShorthandSectionSchema> =
  {
    id: SHORTHAND_SECTION_ID,
    title: "Shorthand",
    description: "Where abbreviation expansion runs.",
    fields: shorthandFields,
  };

/**
 * Registers the shorthand section on `store` and returns its typed handle.
 * Idempotent (the store returns the live handle for a repeated id with the same
 * schema), so more than one slice may call it safely.
 */
export function registerShorthandSection(
  store: PreferenceStore,
): ShorthandSectionHandle {
  return store.registerSection(shorthandSectionDefinition);
}

/** Reads the current configured scope off a section handle. */
export function readShorthandScope(
  handle: ShorthandSectionHandle,
): ShorthandScope {
  return handle.get(SHORTHAND_SCOPE_KEY);
}
