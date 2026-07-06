/**
 * Types for the namespaced preference store core (slice 1 of the Settings Shell
 * & Preferences Store feature).
 *
 * This is the pure, in-memory contract only: no React, no Tauri, no persistence.
 * Later slices attach persistence and React bindings at the {@link SectionHandle}
 * subscription seam rather than reworking this core.
 *
 * A feature registers a self-describing *section* - a schema of typed keys, each
 * carrying a default value plus optional rendering metadata - and then reads,
 * writes, and resets that section's values through the returned handle.
 */

/**
 * One key in a section schema: its default value plus optional metadata that
 * lets a settings UI render an editor for it without the feature hand-wiring a
 * form. The value type `T` is inferred from `default`.
 */
export interface PreferenceField<T> {
  /** The value returned when the key has never been set (or after a reset). */
  readonly default: T;
  /** Human-facing label for the control. */
  readonly label?: string;
  /** Longer help text describing the setting. */
  readonly description?: string;
  /** Enumerated choices, when the value is one of a fixed set (renders a select). */
  readonly options?: readonly T[];
}

/** A section schema: a record of key names to their {@link PreferenceField}. */
export type SectionSchema = Record<string, PreferenceField<unknown>>;

/**
 * A feature's registration payload for one section: a stable `id` (the
 * namespace), optional display metadata, and the `fields` schema.
 */
export interface SectionDefinition<S extends SectionSchema = SectionSchema> {
  /** Stable namespace id, unique across the store (e.g. `"formatting"`). */
  readonly id: string;
  /** Human-facing section title for the settings UI. */
  readonly title?: string;
  /** Longer description of what the section groups. */
  readonly description?: string;
  /** The typed keys of the section. */
  readonly fields: S;
}

/** The concrete value object for a schema: each key mapped to its value type. */
export type SectionValues<S extends SectionSchema> = {
  [K in keyof S]: S[K] extends PreferenceField<infer T> ? T : never;
};

/**
 * The typed handle a feature holds onto a registered section. Reads fall back to
 * defaults; writes and resets are immediate and notify subscribers.
 */
export interface SectionHandle<S extends SectionSchema = SectionSchema> {
  /** The section's namespace id. */
  readonly id: string;
  /** The self-describing definition, for rendering the section's UI. */
  readonly definition: SectionDefinition<S>;
  /** Reads one key, returning its set value or, if unset, its default. */
  get<K extends keyof S>(key: K): SectionValues<S>[K];
  /** Sets one key and notifies this section's subscribers. */
  set<K extends keyof S>(key: K, value: SectionValues<S>[K]): void;
  /** Reads every key as one snapshot (defaults merged with set overrides). */
  getAll(): SectionValues<S>;
  /** Restores every key to its registered default and notifies subscribers. */
  reset(): void;
  /**
   * Observes changes to this section. The listener fires on every set/reset
   * (never immediately on subscribe), receiving the current snapshot. Returns
   * an unsubscribe function. This is the seam persistence and React bindings
   * attach to in later slices.
   */
  subscribe(listener: (values: SectionValues<S>) => void): () => void;
}

/**
 * The store root: a namespace of sections. Pure and in-memory; the single
 * coherent home the persistence and React slices build on.
 */
export interface PreferenceStore {
  /**
   * Registers a section under its `id` and returns a typed handle.
   *
   * Duplicate registration is safe: re-registering the *same* schema (same keys
   * and defaults) is idempotent - it returns the existing handle, preserving any
   * values already set - while re-registering an id with a *different* schema
   * throws, so a mismatch is never silently resolved by clobbering data.
   */
  registerSection<S extends SectionSchema>(
    definition: SectionDefinition<S>,
  ): SectionHandle<S>;
  /** Returns a previously registered section's handle, or `undefined`. */
  getSection<S extends SectionSchema = SectionSchema>(
    id: string,
  ): SectionHandle<S> | undefined;
  /** Lists every registered section's definition, in registration order. */
  listSections(): SectionDefinition[];
}
