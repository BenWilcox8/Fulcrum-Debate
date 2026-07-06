import type { ComponentType } from "react";
import type {
  SectionDefinition,
  SectionHandle,
  SectionSchema,
} from "../preferences";

/**
 * Types for the Settings screen shell and its contribution seam (slice 4 of the
 * Settings Shell & Preferences Store feature).
 *
 * The shell lists the preference sections registered on the shared store and
 * renders each section's *contributed panel* - the feature-owned React control
 * surface for that section. Individual feature panels (formatting, tools,
 * shorthand, ...) arrive with their own later features; this slice defines the
 * seam and proves it with a demo contribution.
 */

/**
 * Props a contributed settings panel receives: the live, typed
 * {@link SectionHandle} for its section. The panel reads reactively through
 * `useSection`/`usePreferenceValue` and writes with `handle.set` - it never
 * needs to reach the store directly.
 */
export interface SettingsPanelProps<S extends SectionSchema = SectionSchema> {
  readonly handle: SectionHandle<S>;
}

/** A feature-owned React panel that renders one section's controls. */
export type SettingsPanel<S extends SectionSchema = SectionSchema> =
  ComponentType<SettingsPanelProps<S>>;

/**
 * One feature's contribution to the Settings screen: the section schema to
 * register on the shared store, plus the optional panel that renders it. A
 * contribution without a `panel` still appears as a navigable, resettable
 * entry - it just has no control body yet.
 */
export interface SettingsContribution<S extends SectionSchema = SectionSchema> {
  readonly definition: SectionDefinition<S>;
  readonly panel?: SettingsPanel<S>;
}

/** The panel registry the shell looks up by section id. */
export type SettingsPanelRegistry = Readonly<Record<string, SettingsPanel>>;

/**
 * Authors a contribution with full per-feature typing, then erases the schema
 * generic so it can live in the app's `SettingsContribution[]` list.
 *
 * A settings panel is contravariant in its section schema (it consumes a
 * `SectionHandle<S>`), so a `SettingsContribution<SpecificSchema>` does not
 * widen to `SettingsContribution<SectionSchema>` on its own. This helper checks
 * the panel against its section's schema at the definition site (where the types
 * are known and useful) and hands back the erased type the registry stores - the
 * shell only ever calls a panel with that section's own handle, so the erasure
 * is sound.
 */
export function defineSettingsContribution<S extends SectionSchema>(
  contribution: SettingsContribution<S>,
): SettingsContribution {
  // The panel is contravariant in `S`, so this widening cannot be expressed
  // directly; it is sound because the shell only invokes a panel with its own
  // section's handle. Routed through `unknown` as TS requires for the cast.
  return contribution as unknown as SettingsContribution;
}
