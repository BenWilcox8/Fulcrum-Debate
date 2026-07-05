/**
 * The local document registry for Fulcrum Debate.
 *
 * The {@link import("../core").DocumentHandle | document core} persists each
 * artifact's *content* in its own per-id IndexedDB database. The registry is the
 * sibling index: one locally-persisted store holding the *metadata* for every
 * document - id, kind, title, created time, last-edited time - so the app can
 * list what exists without opening every document.
 *
 * This module is the registry primitive only. A service API (create / open /
 * rename / delete orchestration) and React hooks are separate follow-up tasks
 * and deliberately live elsewhere; they drive the primitives here. Orchestration
 * that spans layers - e.g. also deleting a document's content database on
 * {@link DocumentRegistry.remove} - belongs to the service task, not here.
 *
 * ## Persistence: the same binding, a well-known store
 *
 * The registry survives restarts using the document core's own persistence
 * binding (y-indexeddb) rather than any new machinery. It is *not* itself a
 * debate artifact, so it does not go through `openDocument` (which is
 * artifact-shaped and demands a {@link DocumentKind}). Instead it owns one
 * well-known Y.Doc under a sibling namespace, {@link REGISTRY_DB_NAME}, bound by
 * the exact same {@link IndexeddbPersistence} provider the core uses. A fresh
 * registry instance opened over the same IndexedDB backend reads its entries
 * back - the mechanism the restart test exercises.
 *
 * Like the core, nothing here awaits the network: {@link DocumentRegistry.whenLoaded}
 * reflects local IndexedDB read completion alone.
 *
 * ## Last-edited maintenance
 *
 * The registry must reflect when a document was last changed, but it must learn
 * that *without leaking Yjs internals* to its callers. Two primitives cover it:
 *
 * - {@link DocumentRegistry.touch} - the low-level "bump this id's last-edited
 *   time" primitive the future service can call from anywhere it knows an edit
 *   happened.
 * - {@link DocumentRegistry.track} - the ergonomic form: hand it an open
 *   {@link DocumentHandle} and the registry subscribes to that document's own
 *   update stream and calls `touch` on genuine local edits. Callers pass a
 *   handle, never a `Y.Doc` or a persistence provider, so no Yjs detail leaks
 *   across the seam.
 */
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

import type { DocumentHandle } from "../core";
import type { AddEntryInput, RegistryEntry } from "./entry";

/**
 * IndexedDB database name backing the registry store.
 *
 * A sibling of the document core's `fulcrum:doc:<id>` namespace: one fixed,
 * well-known database holds the whole registry.
 */
export const REGISTRY_DB_NAME = "fulcrum:registry";

/** Top-level Y.Map (keyed by document id) holding one nested entry map each. */
const ENTRIES_KEY = "entries";

/** Field keys inside a single entry's nested Y.Map. */
const FIELD = {
  id: "id",
  kind: "kind",
  title: "title",
  createdAt: "createdAt",
  lastEditedAt: "lastEditedAt",
} as const;

/**
 * A live handle to the local document registry.
 *
 * Obtain one from {@link openRegistry}. Reads ({@link get}, {@link list}) are
 * synchronous over in-memory Yjs state; writes ({@link add}, {@link updateTitle},
 * {@link touch}, {@link remove}) apply synchronously and persist to IndexedDB in
 * the background. {@link close} the handle when done.
 */
export interface DocumentRegistry {
  /**
   * Resolves once the registry's stored entries have been loaded from local
   * IndexedDB (the provider's local `whenSynced`). Purely local; never network.
   * Reads before this resolves simply see an empty registry.
   */
  readonly whenLoaded: Promise<void>;
  /** Whether the initial local load has completed. */
  readonly loaded: boolean;
  /** Whether {@link close} has been called. */
  readonly closed: boolean;

  /**
   * Registers a new document (called on create). Throws if `id` is empty or is
   * already registered. Returns the created entry. `createdAt`/`lastEditedAt`
   * default to now.
   */
  add(input: AddEntryInput): RegistryEntry;

  /** The entry for `id`, or `undefined` if none is registered. */
  get(id: string): RegistryEntry | undefined;

  /**
   * All entries ordered by last-edited time, most recent first. Ties break by
   * creation time (newer first) then id, so ordering is stable and total.
   */
  list(): RegistryEntry[];

  /**
   * Updates a document's title (called on rename) and bumps its last-edited
   * time - a rename is a user-visible change to the document. No-op-safe target:
   * throws if `id` is not registered. `at` overrides the bump time (defaults to
   * now).
   */
  updateTitle(id: string, title: string, at?: number): RegistryEntry;

  /**
   * Bumps a document's last-edited time to `at` (default now). The low-level
   * primitive behind last-edited maintenance; {@link track} calls it on edits.
   * Throws if `id` is not registered.
   */
  touch(id: string, at?: number): RegistryEntry;

  /**
   * Subscribes to an open document so genuine local edits to it bump the
   * matching registry entry's last-edited time. Returns an unsubscribe function;
   * it is also detached automatically when the handle's doc is destroyed.
   *
   * Updates that y-indexeddb applies while loading the document from storage are
   * ignored, so merely opening a document does not count as an edit. Tracking an
   * id that is not registered is a no-op (the future service adds the entry
   * first, then tracks).
   */
  track(handle: DocumentHandle): () => void;

  /** Removes a document's entry (called on delete). Safe if `id` is absent. */
  remove(id: string): void;

  /**
   * Subscribes `listener` to any registry change (add / rename / touch /
   * remove). Fires after the change is applied; call {@link list} to read the
   * new state. Returns an unsubscribe function.
   */
  subscribe(listener: () => void): () => void;

  /** Tears down the persistence provider and destroys the registry doc. Idempotent. */
  close(): Promise<void>;
}

/**
 * Opens the local document registry, binding it to its well-known IndexedDB
 * store. Entries load asynchronously; await {@link DocumentRegistry.whenLoaded}
 * before relying on persisted content. Nothing here awaits the network.
 */
export function openRegistry(): DocumentRegistry {
  const doc = new Y.Doc();
  const provider = new IndexeddbPersistence(REGISTRY_DB_NAME, doc);
  const entries = doc.getMap<Y.Map<unknown>>(ENTRIES_KEY);

  let loaded = false;
  let closed = false;

  const whenLoaded = provider.whenSynced.then(() => {
    loaded = true;
  });

  const readEntry = (map: Y.Map<unknown> | undefined): RegistryEntry | undefined => {
    if (!map) return undefined;
    return {
      id: map.get(FIELD.id) as string,
      kind: map.get(FIELD.kind) as RegistryEntry["kind"],
      title: map.get(FIELD.title) as string,
      createdAt: map.get(FIELD.createdAt) as number,
      lastEditedAt: map.get(FIELD.lastEditedAt) as number,
    };
  };

  const requireEntry = (id: string): Y.Map<unknown> => {
    const map = entries.get(id);
    if (!map) {
      throw new Error(`DocumentRegistry: no document registered with id "${id}"`);
    }
    return map;
  };

  const registry: DocumentRegistry = {
    whenLoaded,
    get loaded() {
      return loaded;
    },
    get closed() {
      return closed;
    },

    add(input) {
      if (input.id.length === 0) {
        throw new Error("DocumentRegistry.add: id must be a non-empty string");
      }
      if (entries.has(input.id)) {
        throw new Error(
          `DocumentRegistry.add: id "${input.id}" is already registered`,
        );
      }
      const createdAt = input.createdAt ?? Date.now();
      const lastEditedAt = input.lastEditedAt ?? createdAt;

      const entry = new Y.Map<unknown>();
      // A single transaction so observers see the fully-formed entry, never a
      // half-populated one.
      doc.transact(() => {
        entry.set(FIELD.id, input.id);
        entry.set(FIELD.kind, input.kind);
        entry.set(FIELD.title, input.title);
        entry.set(FIELD.createdAt, createdAt);
        entry.set(FIELD.lastEditedAt, lastEditedAt);
        entries.set(input.id, entry);
      });
      return readEntry(entry)!;
    },

    get(id) {
      return readEntry(entries.get(id));
    },

    list() {
      const all: RegistryEntry[] = [];
      entries.forEach((map) => {
        const entry = readEntry(map);
        if (entry) all.push(entry);
      });
      all.sort((a, b) => {
        if (b.lastEditedAt !== a.lastEditedAt) return b.lastEditedAt - a.lastEditedAt;
        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      return all;
    },

    updateTitle(id, title, at) {
      const map = requireEntry(id);
      doc.transact(() => {
        map.set(FIELD.title, title);
        map.set(FIELD.lastEditedAt, at ?? Date.now());
      });
      return readEntry(map)!;
    },

    touch(id, at) {
      const map = requireEntry(id);
      map.set(FIELD.lastEditedAt, at ?? Date.now());
      return readEntry(map)!;
    },

    track(handle) {
      const onUpdate = (_update: Uint8Array, origin: unknown) => {
        if (closed) return;
        // y-indexeddb applies stored updates with the provider as the update
        // origin while loading; skip those so opening a document is not an edit.
        if (origin instanceof IndexeddbPersistence) return;
        if (!entries.has(handle.id)) return;
        registry.touch(handle.id);
      };
      handle.doc.on("update", onUpdate);
      const off = () => handle.doc.off("update", onUpdate);
      // Auto-detach if the tracked doc is destroyed out from under us.
      handle.doc.once("destroy", off);
      return off;
    },

    remove(id) {
      entries.delete(id);
    },

    subscribe(listener) {
      const observer = () => listener();
      entries.observeDeep(observer);
      return () => entries.unobserveDeep(observer);
    },

    async close() {
      if (closed) return;
      closed = true;
      await provider.destroy();
      doc.destroy();
    },
  };

  return registry;
}
