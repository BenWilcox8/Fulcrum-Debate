/**
 * Registers the evidence {@link ./profile | formatting profile} as a section on
 * the shared preference store, so the house formatting standards become
 * **editable and persisted** while staying a single, well-typed object.
 *
 * The section's keys are the {@link FormattingTargetKey formatting targets} and
 * each key's value is the whole {@link FormattingEntry} for that target. That is
 * deliberate: the section's value snapshot (`handle.getAll()`) *is* a
 * {@link FormattingProfile}, so rendering and the Shrink tool read one object,
 * a `set` edits exactly one target, and `reset()` restores the entire standard.
 * Every entry field carries a human label so the Settings panel slice can render
 * controls straight from the schema.
 *
 * This module adds no rendering behaviour - it only wires the model to the store.
 */
import type {
  PreferenceField,
  PreferenceStore,
  SectionDefinition,
  SectionHandle,
} from "../preferences";
import {
  DEFAULT_FORMATTING_PROFILE,
  FORMATTING_TARGET_LABELS,
  type FormattingEntry,
  type FormattingProfile,
  type FormattingTargetKey,
} from "./profile";

/** The well-known store id for the formatting section. */
export const FORMATTING_SECTION_ID = "formatting";

/**
 * The section fields: one object-valued field per target, each defaulting to the
 * standard entry and carrying a label for the settings UI. `satisfies` keeps the
 * concrete literal type (so the schema keys stay exact) while checking that every
 * field is a `PreferenceField<FormattingEntry>` - which also holds each default
 * at the widened {@link FormattingEntry} type, so a feature can `set` any entry.
 */
const formattingFields = {
  tag: {
    default: DEFAULT_FORMATTING_PROFILE.tag,
    label: FORMATTING_TARGET_LABELS.tag,
    description: "Formatting for a card's tag line.",
  },
  cite: {
    default: DEFAULT_FORMATTING_PROFILE.cite,
    label: FORMATTING_TARGET_LABELS.cite,
    description: "Formatting for a card's citation line.",
  },
  body: {
    default: DEFAULT_FORMATTING_PROFILE.body,
    label: FORMATTING_TARGET_LABELS.body,
    description: "Formatting for a card's body prose.",
  },
  highlight: {
    default: DEFAULT_FORMATTING_PROFILE.highlight,
    label: FORMATTING_TARGET_LABELS.highlight,
    description: "Formatting for highlighted (read-aloud) body text.",
  },
  unformatted: {
    default: DEFAULT_FORMATTING_PROFILE.unformatted,
    label: FORMATTING_TARGET_LABELS.unformatted,
    description:
      "Formatting for un-highlighted body text; also the Shrink tool's target size.",
  },
} satisfies Record<FormattingTargetKey, PreferenceField<FormattingEntry>>;

/** The formatting section's schema type (its exact keys and value types). */
export type FormattingSectionSchema = typeof formattingFields;

/** The typed handle to a registered formatting section. */
export type FormattingSectionHandle = SectionHandle<FormattingSectionSchema>;

/** The section definition registered against the preference store. */
export const formattingSectionDefinition: SectionDefinition<FormattingSectionSchema> =
  {
    id: FORMATTING_SECTION_ID,
    title: "Formatting",
    description: "Evidence formatting standards for tags, cites, and body text.",
    fields: formattingFields,
  };

/**
 * Registers the formatting section on `store` and returns its typed handle.
 * Registration is idempotent (the store returns the live handle for a repeated
 * id with the same schema), so this is safe to call from more than one slice.
 */
export function registerFormattingSection(
  store: PreferenceStore,
): FormattingSectionHandle {
  return store.registerSection(formattingSectionDefinition);
}

/**
 * Reads the current formatting profile off a section handle - a thin, typed
 * alias for `handle.getAll()` (defaults merged with any set overrides). This is
 * the object rendering and the Shrink tool consume.
 */
export function readFormattingProfile(
  handle: FormattingSectionHandle,
): FormattingProfile {
  return handle.getAll();
}
