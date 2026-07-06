import {
  defineSettingsContribution,
  type SettingsContribution,
} from "../settings/types";
import { FormattingSettingsPanel } from "./FormattingSettingsPanel";
import { formattingSectionDefinition } from "./preferences";

/**
 * The Evidence Formatting feature's Settings contribution: the formatting
 * section schema (already the store's `"formatting"` section) plus the panel
 * that renders its editable controls. Wired into the app through
 * `SETTINGS_CONTRIBUTIONS`.
 *
 * Kept in its own module (separate from the panel component) so the
 * component-free contribution value can be imported without tripping
 * react-refresh/only-export-components, mirroring the demo section's split.
 */
export const formattingSettingsContribution: SettingsContribution =
  defineSettingsContribution({
    definition: formattingSectionDefinition,
    panel: FormattingSettingsPanel,
  });
