import { toolSectionDefinition, type CardToolDefinition } from "../../tools";
import { SchemaSettingsPanel } from "../SchemaSettingsPanel";
import type { SettingsContribution } from "../types";

/**
 * Bridges the card-cutting tool registry to the Settings screen: turns each
 * tool definition into a {@link SettingsContribution} whose section is the tool's
 * namespaced settings section (the same one the tool registry registers) and
 * whose panel is the generic {@link SchemaSettingsPanel}, so the tool's declared
 * settings render as editable controls generated straight from its schema.
 *
 * Reusing {@link toolSectionDefinition} keeps the section shape identical to what
 * the registry registers, so a tool registered on the store (for `apply`) and its
 * Settings contribution point at one section - edits made in Settings are read
 * live by the running tool, and the shell's per-section reset restores the tool's
 * declared defaults.
 *
 * The panel is contravariant in its section schema, so the erased
 * `SettingsContribution` (rather than the per-schema generic) is what the
 * contribution list holds; the shell only ever invokes the panel with its own
 * section's handle, so the erasure is sound.
 */
export function toolSettingsContributions(
  definitions: readonly CardToolDefinition[],
): SettingsContribution[] {
  return definitions.map((definition) => ({
    definition: toolSectionDefinition(definition),
    panel: SchemaSettingsPanel,
  }));
}
