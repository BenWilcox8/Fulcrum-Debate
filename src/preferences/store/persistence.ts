/**
 * Local persistence for the namespaced preference store (slice 2 of the Settings
 * Shell & Preferences Store feature).
 *
 * This attaches to the pure {@link createPreferenceStore} core at its existing
 * seams - it does not rework the core. On write it observes each section through
 * the public {@link SectionHandle.subscribe} seam; on read it seeds set values
 * back through {@link SectionHandle.set} once the local store has loaded.
 *
 * ## Mechanism: y-indexeddb, mirroring the document registry
 *
 * The store holds arbitrary section x key JSON values - a shape the fixed,
 * Rust-owned `Preferences` struct behind the IPC seam cannot represent. The
 * document *registry* already establishes the right pattern for non-artifact,
 * local-first app state: one well-known Y.Doc bound by the same y-indexeddb
 * provider the document core uses (see `src/documents/registry`). We follow it
 * here rather than inventing new machinery or a generic Rust key/value command:
 *
 * - It is genuinely local and offline - {@link PersistentPreferenceStore.whenLoaded}
 *   reflects local IndexedDB read completion alone, never the network - so it
 *   upholds the local-first boot rule.
 * - It stays free of React and Tauri, matching the store core's own constraint,
 *   so this slice bolts on without dragging either dependency into the core.
 *
 * ## What is persisted: overrides only, never baked defaults
 *
 * Only keys whose value *differs from the field default* are written. Unset keys
 * (and keys explicitly set back to their default) are stored as nothing, so on
 * reload they resolve to the registered default again - which also means a future
 * change to a default flows through to any key the user never diverged. This is
 * derived purely from the public seam (each field's `default` plus `getAll`); the
 * core never exposes its private override set, and we never reach into it.
 */
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

import { createPreferenceStore } from "./store";
import type {
  PreferenceStore,
  SectionDefinition,
  SectionHandle,
  SectionSchema,
} from "./types";
import { clone, deepEqual } from "./utils";

/**
 * IndexedDB database name backing the preference store. A sibling of the
 * registry's `fulcrum:registry`: one fixed, well-known database holds every
 * section's persisted overrides.
 */
export const PREFERENCES_DB_NAME = "fulcrum:preferences";

/** Top-level Y.Map keyed by section id; each value is a nested overrides map. */
const SECTIONS_KEY = "sections";

/**
 * A {@link PreferenceStore} whose set values survive an app restart, persisted
 * to the local y-indexeddb store. The registration surface is identical to the
 * core store; persistence attaches transparently as sections register.
 */
export interface PersistentPreferenceStore extends PreferenceStore {
  /**
   * Resolves once the persisted overrides have loaded from local IndexedDB (the
   * provider's local `whenSynced`). Purely local; never network. Sections read
   * before this resolves simply see their defaults until hydration completes.
   */
  readonly whenLoaded: Promise<void>;
  /** Whether the initial local load has completed. */
  readonly loaded: boolean;
  /** Tears down the persistence provider and destroys the backing doc. Idempotent. */
  close(): Promise<void>;
}

/**
 * Opens a preference store backed by local persistence.
 *
 * Wraps a fresh {@link createPreferenceStore} core and binds it to the
 * well-known IndexedDB store. Values set through the returned handles are
 * written locally and rehydrated when a fresh store is opened over the same
 * backend. Nothing here awaits the network.
 */
export function openPreferenceStore(): PersistentPreferenceStore {
  const inner = createPreferenceStore();

  const doc = new Y.Doc();
  const provider = new IndexeddbPersistence(PREFERENCES_DB_NAME, doc);
  const sections = doc.getMap<Y.Map<unknown>>(SECTIONS_KEY);

  let loaded = false;
  let closed = false;
  // Set while seeding stored values into a handle, so hydration's own `set`
  // calls do not re-persist a half-hydrated section over the stored data.
  let hydrating = false;
  // Sections whose persistence wiring is already attached, so a StrictMode /
  // hot-reload re-registration does not double-subscribe.
  const wired = new Set<string>();

  const whenLoaded = provider.whenSynced.then(() => {
    loaded = true;
  });

  /**
   * The keys of `handle` whose current value diverges from the field default -
   * the only keys worth persisting. Values are cloned across the boundary so a
   * later mutation of a stored object cannot corrupt what we wrote.
   */
  const overridesOf = (handle: SectionHandle): Record<string, unknown> => {
    const snapshot = handle.getAll();
    const fields = handle.definition.fields;
    const overrides: Record<string, unknown> = {};
    for (const key of Object.keys(fields)) {
      if (!deepEqual(snapshot[key], fields[key].default)) {
        overrides[key] = clone(snapshot[key]);
      }
    }
    return overrides;
  };

  /** Writes `handle`'s current overrides, replacing whatever was stored. */
  const persist = (handle: SectionHandle): void => {
    if (closed || hydrating) return;
    const overrides = overridesOf(handle);
    doc.transact(() => {
      if (Object.keys(overrides).length === 0) {
        sections.delete(handle.id);
        return;
      }
      // Replace the nested map wholesale - the data is small plain JSON, so a
      // rebuild is simpler and safer than diffing keys in place.
      const map = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(overrides)) {
        map.set(key, clone(value));
      }
      sections.set(handle.id, map);
    });
  };

  /**
   * Seeds stored overrides into `handle`. A stored key is applied only when the
   * handle is still at that field's default, so a value the user set during the
   * load gap is never clobbered.
   */
  const hydrate = (handle: SectionHandle): void => {
    if (closed) return;
    const stored = sections.get(handle.id);
    if (!stored) return;
    const fields = handle.definition.fields;
    // Snapshot the stored overrides up front for defensive clarity: the loop
    // body re-enters `set`, and iterating a stable copy avoids any coupling to
    // the Y.Map's internal state during the loop.
    const overrides = new Map<string, unknown>();
    for (const key of Object.keys(fields)) {
      if (stored.has(key)) overrides.set(key, clone(stored.get(key)));
    }
    hydrating = true;
    try {
      for (const [key, value] of overrides) {
        // Skip a key the user already diverged from its default during the
        // load gap, so hydration never clobbers an in-flight choice.
        if (!deepEqual(handle.get(key), fields[key].default)) continue;
        handle.set(key, value);
      }
    } finally {
      hydrating = false;
    }
  };

  const wire = (handle: SectionHandle): void => {
    if (wired.has(handle.id)) return;
    wired.add(handle.id);

    // Hydrate now if the local load is already done, otherwise once it is.
    if (loaded) hydrate(handle);
    else void whenLoaded.then(() => hydrate(handle));

    // Persist on every subsequent set/reset. Hydration's own `set` calls are
    // fully suppressed by the `hydrating` guard in `persist` - that guard is
    // load-bearing, not a harmless optimization.
    handle.subscribe(() => persist(handle));
  };

  return {
    registerSection<S extends SectionSchema>(definition: SectionDefinition<S>) {
      const handle = inner.registerSection(definition);
      wire(handle as SectionHandle);
      return handle;
    },
    getSection: inner.getSection,
    listSections: inner.listSections,
    whenLoaded,
    get loaded() {
      return loaded;
    },
    async close() {
      if (closed) return;
      closed = true;
      await provider.destroy();
      doc.destroy();
    },
  };
}

