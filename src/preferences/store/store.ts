import type {
  PreferenceStore,
  SectionDefinition,
  SectionHandle,
  SectionSchema,
  SectionValues,
} from "./types";

/**
 * Creates a namespaced, typed preference store core.
 *
 * Pure and in-memory: no React, no Tauri, no persistence. Features register
 * self-describing sections and read/write/reset their typed values; later slices
 * attach persistence and React bindings at each section's `subscribe` seam.
 *
 * See {@link PreferenceStore} for the registration/duplication contract.
 */
export function createPreferenceStore(): PreferenceStore {
  // Registration order is preserved for `listSections` (Map iterates in
  // insertion order), which keeps the settings UI stable across reloads.
  const sections = new Map<string, InternalSection>();

  function registerSection<S extends SectionSchema>(
    definition: SectionDefinition<S>,
  ): SectionHandle<S> {
    const existing = sections.get(definition.id);
    if (existing) {
      if (!schemasMatch(existing.definition.fields, definition.fields)) {
        throw new Error(
          `Preference section "${definition.id}" is already registered with a ` +
            `different schema. Re-registration must use the same keys and ` +
            `defaults; change the section id instead of repurposing it.`,
        );
      }
      // Idempotent: same schema, so hand back the live handle. Any values
      // already set are preserved - re-registration never clobbers data.
      return existing.handle as SectionHandle<S>;
    }

    const created = createSection(definition);
    sections.set(definition.id, created);
    return created.handle as SectionHandle<S>;
  }

  function getSection<S extends SectionSchema = SectionSchema>(
    id: string,
  ): SectionHandle<S> | undefined {
    return sections.get(id)?.handle as SectionHandle<S> | undefined;
  }

  function listSections(): SectionDefinition[] {
    return [...sections.values()].map((s) => s.definition);
  }

  return { registerSection, getSection, listSections };
}

/** A section's live state, kept behind the public {@link SectionHandle}. */
interface InternalSection {
  readonly definition: SectionDefinition;
  readonly handle: SectionHandle;
}

function createSection<S extends SectionSchema>(
  definition: SectionDefinition<S>,
): InternalSection {
  // Only explicitly-set keys are stored; unset keys resolve to their default,
  // so a reset is simply "forget the overrides".
  const overrides = new Map<keyof S, unknown>();
  const listeners = new Set<(values: SectionValues<S>) => void>();

  const get = <K extends keyof S>(key: K): SectionValues<S>[K] => {
    if (overrides.has(key)) {
      return clone(overrides.get(key)) as SectionValues<S>[K];
    }
    return clone(definition.fields[key].default) as SectionValues<S>[K];
  };

  const getAll = (): SectionValues<S> => {
    const values = {} as SectionValues<S>;
    for (const key of Object.keys(definition.fields) as (keyof S)[]) {
      values[key] = get(key);
    }
    return values;
  };

  const notify = () => {
    const snapshot = getAll();
    for (const listener of listeners) listener(snapshot);
  };

  const set = <K extends keyof S>(key: K, value: SectionValues<S>[K]): void => {
    overrides.set(key, clone(value));
    notify();
  };

  const reset = (): void => {
    overrides.clear();
    notify();
  };

  const subscribe = (
    listener: (values: SectionValues<S>) => void,
  ): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const handle: SectionHandle<S> = {
    id: definition.id,
    definition,
    get,
    set,
    getAll,
    reset,
    subscribe,
  };

  return {
    definition: definition as SectionDefinition,
    handle: handle as SectionHandle,
  };
}

/**
 * Two schemas match when they declare the same keys with deeply-equal default
 * values. Rendering metadata (label/description/options) is intentionally not
 * compared: only keys and defaults affect stored data, so only a divergence
 * there risks silent data loss.
 */
function schemasMatch(a: SectionSchema, b: SectionSchema): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key].default, b[key].default)) return false;
  }
  return true;
}

/** Deep structural equality for plain, JSON-serializable preference values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    const aArr = a as unknown[];
    const bArr = b as unknown[];
    if (aArr.length !== bArr.length) return false;
    return aArr.every((v, i) => deepEqual(v, bArr[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bObj, key) &&
      deepEqual(aObj[key], bObj[key]),
  );
}

/**
 * Clones a value on the read/write boundary so a caller mutating a returned
 * snapshot (or a stored object) cannot corrupt the store's state. Preference
 * values are plain JSON-serializable data, so `structuredClone` is sufficient;
 * primitives pass straight through.
 */
function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return structuredClone(value);
}
