import type { SectionDefinition } from "../../preferences";
import { defineSettingsContribution, type SettingsContribution } from "../types";
import { DemoSettingsPanel } from "./DemoSettingsPanel";

/**
 * A demonstration settings section that proves the contribution seam end to end
 * without shipping a real feature panel. Real feature slices (formatting, tools,
 * shorthand, ...) will register their own sections and panels the same way; this
 * placeholder can be dropped once one of them lands.
 *
 * Defaults are widened where the panel needs to set the other value (`enabled`),
 * matching the store-core convention.
 */
export const demoSectionFields = {
  message: {
    default: "This is a demo section proving the settings contribution seam.",
    label: "Message",
    description: "Shown to confirm a contributed panel renders live.",
  },
  enabled: {
    default: true as boolean,
    label: "Enabled",
    description: "A toggle whose live value the panel reads and writes.",
  },
};

const demoSectionDefinition: SectionDefinition<typeof demoSectionFields> = {
  id: "demo",
  title: "Demo",
  description:
    "A placeholder section that demonstrates the settings contribution seam.",
  fields: demoSectionFields,
};

/** The demo's contribution, wired into the app's Settings provider. */
export const demoSettingsContribution: SettingsContribution =
  defineSettingsContribution({
    definition: demoSectionDefinition,
    panel: DemoSettingsPanel,
  });
