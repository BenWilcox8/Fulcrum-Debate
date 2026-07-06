import { shorthandSectionDefinition } from "../../shorthand";
import { SchemaSettingsPanel } from "../SchemaSettingsPanel";
import { defineSettingsContribution, type SettingsContribution } from "../types";

/**
 * The Shorthand Engine's Settings contribution: the shorthand section schema
 * (the store's `"shorthand"` section, holding the scope preference) rendered by
 * the generic {@link SchemaSettingsPanel}, so the scope select is generated
 * straight from the field's `options` metadata with no bespoke panel.
 *
 * The section is the same one {@link ../../shorthand.registerShorthandSection}
 * registers (and that the flow surface reads through
 * {@link ../../shorthand/react.useShorthandScope}), so a scope edited here is read
 * live by the flow surface's next transition and the shell's per-section reset
 * restores the default scope. Kept in its own module (no component export) so the
 * contribution value imports cleanly, mirroring the tools/formatting split.
 */
export const shorthandSettingsContribution: SettingsContribution =
  defineSettingsContribution({
    definition: shorthandSectionDefinition,
    panel: SchemaSettingsPanel,
  });
