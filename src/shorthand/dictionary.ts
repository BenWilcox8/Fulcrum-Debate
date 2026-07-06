/**
 * The **abbreviation -> expansion dictionary** for the Shorthand Engine (slice
 * 1/2 of the Shorthand Engine PRD).
 *
 * A debater flowing a round types terse abbreviations (`aff`, `cx`, `fw`, ...)
 * and the engine rewrites them to their full form at a box/argument transition
 * (see {@link ./expand | the expansion engine}). This module owns the *data*:
 * the abbreviation -> expansion mapping and its local persistence. It is
 * deliberately free of Tiptap and React - the engine consumes it through a plain
 * {@link ShorthandLookup} function, so the same dictionary drives the flow
 * surface now and a speech-doc surface later without either importing this
 * module's persistence machinery.
 *
 * ## Persistence: y-indexeddb, mirroring the registry / preference store
 *
 * The dictionary is app state, not a debate artifact, so - exactly like the
 * document {@link ../documents/registry | registry} and the
 * {@link ../preferences/store/persistence | preference store} - it owns one
 * well-known Y.Doc under a sibling namespace ({@link SHORTHAND_DB_NAME}) bound by
 * the same {@link IndexeddbPersistence} provider the document core uses, rather
 * than inventing new machinery. A fresh dictionary opened over the same backend
 * reads its entries back, and nothing here awaits the network:
 * {@link ShorthandDictionary.whenLoaded} reflects local IndexedDB read
 * completion alone.
 *
 * ## Matching contract: whole-token, exact
 *
 * {@link ShorthandDictionary.lookup} is an exact, case-sensitive map read - it
 * returns an expansion only for an abbreviation stored *verbatim*. The engine
 * feeds it one whole word token at a time, so a substring or partial token can
 * never resolve to an expansion. Keeping the match exact here (rather than
 * fuzzy/prefix) is what makes expansion non-surprising.
 *
 * Management UI and team sync are a separate PRD (SH2); this slice ships the
 * model plus {@link DEFAULT_SHORTHAND_ENTRIES} / {@link seedShorthandDictionary}
 * as fixtures so a surface (and the tests) can exercise a populated dictionary.
 */
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

import type { ShorthandLookup } from "./expand";

/**
 * IndexedDB database name backing the shorthand dictionary. A sibling of the
 * registry's `fulcrum:registry` and the preference store's
 * `fulcrum:preferences`: one fixed, well-known database holds every entry.
 */
export const SHORTHAND_DB_NAME = "fulcrum:shorthand";

/** Top-level Y.Map keyed by abbreviation; each value is its expansion string. */
const ENTRIES_KEY = "entries";

/** One dictionary row: an abbreviation and the text it expands to. */
export interface ShorthandEntry {
  /** The whole-token abbreviation a debater types (e.g. `"aff"`). */
  readonly abbreviation: string;
  /** The full text the abbreviation expands to (e.g. `"affirmative"`). */
  readonly expansion: string;
}

/**
 * A live handle to the local shorthand dictionary.
 *
 * Obtain one from {@link openShorthandDictionary}. Reads ({@link lookup},
 * {@link entries}) are synchronous over in-memory Yjs state; writes
 * ({@link set}, {@link remove}) apply synchronously and persist to IndexedDB in
 * the background. {@link close} the handle when done.
 */
export interface ShorthandDictionary {
  /**
   * Resolves once the dictionary's stored entries have been loaded from local
   * IndexedDB (the provider's local `whenSynced`). Purely local; never network.
   * Reads before this resolves simply see an empty dictionary.
   */
  readonly whenLoaded: Promise<void>;
  /** Whether the initial local load has completed. */
  readonly loaded: boolean;
  /** Whether {@link close} has been called. */
  readonly closed: boolean;

  /**
   * The expansion for `abbreviation`, or `undefined` if none is stored. Exact
   * and case-sensitive - this is the {@link ShorthandLookup} the engine calls
   * with one whole token at a time. Bound (a closure), so it can be passed as a
   * bare function reference.
   */
  lookup(abbreviation: string): string | undefined;

  /**
   * Stores (or overwrites) an abbreviation's expansion. Throws if either side is
   * empty - an empty abbreviation could never be typed as a token, and an empty
   * expansion would silently delete text.
   */
  set(abbreviation: string, expansion: string): void;

  /** Removes an abbreviation. Safe if it is absent. */
  remove(abbreviation: string): void;

  /** Every entry, sorted by abbreviation for a stable listing. */
  entries(): ShorthandEntry[];

  /**
   * Subscribes `listener` to any change (set / remove). Fires after the change
   * is applied; call {@link entries} / {@link lookup} to read the new state.
   * Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void;

  /** Tears down the persistence provider and destroys the doc. Idempotent. */
  close(): Promise<void>;
}

/**
 * Opens the local shorthand dictionary, binding it to its well-known IndexedDB
 * store. Entries load asynchronously; await {@link ShorthandDictionary.whenLoaded}
 * before relying on persisted content. Nothing here awaits the network.
 */
export function openShorthandDictionary(): ShorthandDictionary {
  const doc = new Y.Doc();
  const provider = new IndexeddbPersistence(SHORTHAND_DB_NAME, doc);
  const map = doc.getMap<string>(ENTRIES_KEY);

  let loaded = false;
  let closed = false;

  const whenLoaded = provider.whenSynced.then(() => {
    loaded = true;
  });

  const lookup: ShorthandLookup = (abbreviation) => map.get(abbreviation);

  return {
    whenLoaded,
    get loaded() {
      return loaded;
    },
    get closed() {
      return closed;
    },

    lookup,

    set(abbreviation, expansion) {
      if (abbreviation.length === 0) {
        throw new Error(
          "ShorthandDictionary.set: abbreviation must be a non-empty string",
        );
      }
      if (expansion.length === 0) {
        throw new Error(
          `ShorthandDictionary.set: expansion for "${abbreviation}" must be a non-empty string`,
        );
      }
      map.set(abbreviation, expansion);
    },

    remove(abbreviation) {
      if (map.has(abbreviation)) map.delete(abbreviation);
    },

    entries() {
      const all: ShorthandEntry[] = [];
      map.forEach((expansion, abbreviation) => {
        all.push({ abbreviation, expansion });
      });
      all.sort((a, b) =>
        a.abbreviation < b.abbreviation
          ? -1
          : a.abbreviation > b.abbreviation
            ? 1
            : 0,
      );
      return all;
    },

    subscribe(listener) {
      const onChange = () => listener();
      map.observe(onChange);
      return () => map.unobserve(onChange);
    },

    async close() {
      if (closed) return;
      closed = true;
      await provider.destroy();
      doc.destroy();
    },
  };
}

/**
 * A small starter set of common debate abbreviations - fixtures for tests and
 * for a surface to seed a fresh dictionary until the management UI (SH2) lands.
 * Not applied automatically by {@link openShorthandDictionary}; seed explicitly
 * with {@link seedShorthandDictionary}.
 */
export const DEFAULT_SHORTHAND_ENTRIES: readonly ShorthandEntry[] = [
  { abbreviation: "aff", expansion: "affirmative" },
  { abbreviation: "neg", expansion: "negative" },
  { abbreviation: "cx", expansion: "cross-examination" },
  { abbreviation: "fw", expansion: "framework" },
  { abbreviation: "ext", expansion: "extend" },
  { abbreviation: "resp", expansion: "response" },
  { abbreviation: "perm", expansion: "permutation" },
  { abbreviation: "impx", expansion: "impact" },
];

/**
 * Seeds `dictionary` with the given entries (default
 * {@link DEFAULT_SHORTHAND_ENTRIES}), leaving any abbreviation already present
 * untouched - so it is idempotent and never clobbers a user-set expansion. A
 * fixture helper, not part of the persistence contract.
 */
export function seedShorthandDictionary(
  dictionary: ShorthandDictionary,
  entries: readonly ShorthandEntry[] = DEFAULT_SHORTHAND_ENTRIES,
): void {
  for (const { abbreviation, expansion } of entries) {
    if (dictionary.lookup(abbreviation) === undefined) {
      dictionary.set(abbreviation, expansion);
    }
  }
}
