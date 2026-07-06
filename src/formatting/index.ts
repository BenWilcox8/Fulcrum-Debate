/**
 * Evidence formatting standards & customization.
 *
 * The pure {@link ./profile | formatting profile} model encodes the product's
 * house evidence style (fonts, sizes, colors, and bold/underline per target),
 * and {@link ./preferences} registers it as an editable, persisted section on the
 * shared preference store. {@link ./shrink} adds the standing unformatted-text
 * shrink rule (pure run classification + application) on top of that model.
 * {@link ./css} is the pure profile -> CSS mapping the live card renderer
 * serializes; the reactive rendering layer that mounts it and updates on edits
 * lives in {@link ./react | src/formatting/react} (kept separate so this index
 * stays React-free). {@link ./FormattingSettingsPanel} is this feature's Settings
 * panel, contributed to the Settings screen through
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
export {
  formattingProfileCss,
  DEFAULT_FORMATTING_SCOPE,
  type FormattingCssOptions,
} from "./css";
export { FormattingSettingsPanel } from "./FormattingSettingsPanel";
export { formattingSettingsContribution } from "./formattingSettings";
export {
  UNFORMATTED_TARGET_KEY,
  classifyRuns,
  classifyRunAt,
  shrinkSize,
  applyShrinkRule,
  type ClassifiedRun,
} from "./shrink";
