/**
 * Evidence formatting standards & customization.
 *
 * The pure {@link ./profile | formatting profile} model encodes the product's
 * house evidence style (fonts, sizes, colors, and bold/underline per target),
 * and {@link ./preferences} registers it as an editable, persisted section on the
 * shared preference store. Sibling slices consume this: live card rendering, the
 * unformatted-shrink rule, and the Settings panel. This module ships model +
 * preferences wiring only - no rendering behaviour.
 */
export {
  FORMATTING_TARGET_KEYS,
  FORMATTING_TARGET_LABELS,
  DEFAULT_FORMATTING_PROFILE,
  FONT_FAMILY_OPTIONS,
  type FormattingTargetKey,
  type FormattingEntry,
  type FormattingProfile,
} from "./profile";
export {
  FORMATTING_SECTION_ID,
  formattingSectionDefinition,
  registerFormattingSection,
  readFormattingProfile,
  type FormattingSectionSchema,
  type FormattingSectionHandle,
} from "./preferences";
