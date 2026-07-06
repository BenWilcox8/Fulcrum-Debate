/**
 * Evidence formatting standards & customization.
 *
 * The pure {@link ./profile | formatting profile} model encodes the product's
 * house evidence style (fonts, sizes, colors, and bold/underline per target),
 * and {@link ./preferences} registers it as an editable, persisted section on the
 * shared preference store. Sibling slices consume this: live card rendering and
 * the unformatted-shrink rule. {@link ./FormattingSettingsPanel} is this
 * feature's Settings panel, contributed to the Settings screen through
 * {@link ./formattingSettings | formattingSettingsContribution}; it renders the
 * profile as editable native controls that write back through the same store,
 * so edits apply live.
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
export { FormattingSettingsPanel } from "./FormattingSettingsPanel";
export { formattingSettingsContribution } from "./formattingSettings";
