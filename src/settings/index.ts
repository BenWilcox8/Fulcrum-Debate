/**
 * The Settings screen shell and its contribution seam (slice 4 of the Settings
 * Shell & Preferences Store feature).
 *
 * - {@link SettingsScreen} is the routed master-detail screen that lists the
 *   sections registered on the shared preference store and renders each one's
 *   contributed panel, with a per-section reset-to-defaults control.
 * - {@link SettingsProvider} is the seam the app wires feature contributions
 *   into: it registers each {@link SettingsContribution}'s section and exposes
 *   its panel to the shell.
 * - {@link SETTINGS_CONTRIBUTIONS} is the app's current contribution list (the
 *   demo section, until real feature panels land).
 */
export { default as SettingsScreen } from "./SettingsScreen";
export { SettingsProvider } from "./SettingsProvider";
export { useSettingsPanels } from "./useSettingsPanels";
export { SETTINGS_CONTRIBUTIONS } from "./contributions";
export { SchemaSettingsPanel } from "./SchemaSettingsPanel";
export { toolSettingsContributions } from "./tools/toolSettingsContributions";
export { defineSettingsContribution } from "./types";
export type {
  SettingsContribution,
  SettingsPanel,
  SettingsPanelProps,
  SettingsPanelRegistry,
} from "./types";
