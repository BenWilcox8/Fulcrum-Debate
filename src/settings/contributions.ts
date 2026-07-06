import { formattingSettingsContribution } from "../formatting";
import { demoSettingsContribution } from "./demo/demoSettings";
import type { SettingsContribution } from "./types";

/**
 * The settings contributions the app wires into {@link SettingsProvider}.
 *
 * Real feature slices (formatting, tools, shorthand, ...) append their own
 * contribution here as they land. The Evidence Formatting feature contributes
 * its profile panel; the demo section remains as the seam's reference example
 * until it is retired.
 */
export const SETTINGS_CONTRIBUTIONS: readonly SettingsContribution[] = [
  formattingSettingsContribution,
  demoSettingsContribution,
];
