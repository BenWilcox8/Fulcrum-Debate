import { demoSettingsContribution } from "./demo/demoSettings";
import type { SettingsContribution } from "./types";

/**
 * The settings contributions the app wires into {@link SettingsProvider}.
 *
 * Real feature slices (formatting, tools, shorthand, ...) append their own
 * contribution here as they land; for now the list carries only the demo
 * section, which proves the contribution seam end to end.
 */
export const SETTINGS_CONTRIBUTIONS: readonly SettingsContribution[] = [
  demoSettingsContribution,
];
