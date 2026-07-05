/**
 * The document service for Fulcrum Debate.
 *
 * The {@link import("../core").DocumentHandle | document core} owns each
 * artifact's *content* (a Yjs doc in its own per-id IndexedDB database) and the
 * {@link import("../registry").DocumentRegistry | registry} owns the *metadata*
 * index. Neither knows about the other; the service is the one seam that
 * composes them into the single API every feature consumes:
 *
 * - {@link DocumentService.create} mints an id, registers the entry, opens the
 *   document, and attaches edit-tracking so content edits bump last-edited.
 * - {@link DocumentService.open} returns the live handle for an id (creating it
 *   from persisted content on first open), also edit-tracked.
 * - {@link DocumentService.list} is the recency-ordered metadata listing.
 * - {@link DocumentService.rename} updates the registry title.
 * - {@link DocumentService.remove} deletes both the registry entry and the
 *   document's content database - a clean, complete removal.
 *
 * ## The seam is tight
 *
 * Feature code needs only this API: it never touches Yjs, y-indexeddb, or the
 * core/registry primitives directly. Handles returned here are the same ones
 * the core produces (so features read/mutate shared types off `handle.doc`), but
 * everything about *which* document exists, its lifecycle, and its metadata flows
 * through the service.
 *
 * ## One handle per id
 *
 * The service owns the open handles: opening (or creating) an id yields a single
 * cached {@link DocumentHandle}, and repeated {@link DocumentService.open} calls
 * for the same id return that same handle. This is where handle deduplication
 * lives - deliberately not in the core, which hands back an independent handle
 * every call. Single ownership is also what lets {@link DocumentService.remove}
 * close the live handle before deleting its database, and lets
 * {@link DocumentService.close} tear every tracked handle down.
 *
 * ## Local-first, never network
 *
 * Everything here is local: the registry and every document persist to
 * IndexedDB, and {@link DocumentService.whenReady} reflects the registry's local
 * load alone. Nothing on any path awaits the network.
 */
import {
  openDocument,
  documentDbName,
  type DocumentHandle,
  type DocumentKind,
} from "../core";
import {
  openRegistry,
  type DocumentRegistry,
  type RegistryEntry,
} from "../registry";

/** Fields accepted when creating a new document. */
export interface CreateDocumentInput {
  /** The artifact kind the new document represents. */
  kind: DocumentKind;
  /** Initial human-facing title. */
  title: string;
}

/**
 * The single API the product consumes for document lifecycle.
 *
 * Obtain one from {@link openDocumentService}. All methods resolve only after
 * the registry's local state has loaded, so listings and duplicate checks see
 * persisted content. {@link close} the service when done.
 */
export interface DocumentService {
  /**
   * Resolves once the registry has loaded its persisted metadata from local
   * IndexedDB. Purely local; never network. Every other method awaits this
   * internally, so callers rarely need it directly.
   */
  readonly whenReady: Promise<void>;

  /** Whether {@link close} has been called. Mirrors the handle/registry flag. */
  readonly closed: boolean;

  /**
   * Creates a new document: mints a stable unique id, registers its metadata,
   * opens its content document, and attaches edit-tracking. Returns the open
   * {@link DocumentHandle}; await its `whenLoaded` before editing shared types.
   */
  create(input: CreateDocumentInput): Promise<DocumentHandle>;

  /**
   * Opens an existing document by id and returns its live handle, with
   * edit-tracking attached so content edits bump last-edited. Repeated calls for
   * the same id return the same cached handle. Throws if `id` is not registered.
   */
  open(id: string): Promise<DocumentHandle>;

  /**
   * All documents' metadata, ordered by last-edited time (most recent first).
   */
  list(): Promise<RegistryEntry[]>;

  /** Renames a document. Throws if `id` is not registered. */
  rename(id: string, title: string): Promise<RegistryEntry>;

  /**
   * Subscribes `listener` to any change in the document set (create / rename /
   * touch / remove), so callers can re-read {@link list} on updates. Fires after
   * the change is applied; returns an unsubscribe function. This is the seam
   * React consumers observe rather than reaching into the registry directly.
   */
  subscribe(listener: () => void): () => void;

  /**
   * Deletes a document completely: closes any open handle for it, removes its
   * registry entry, and deletes its content IndexedDB database. Safe if `id` is
   * not registered or not open.
   */
  remove(id: string): Promise<void>;

  /**
   * Tears the service down: closes every open (tracked) handle and the registry.
   * Idempotent.
   */
  close(): Promise<void>;
}

/** Mints a stable, unique document id. */
function mintId(): string {
  return crypto.randomUUID();
}

/**
 * Deletes an IndexedDB database by name, resolving once it is gone.
 *
 * The caller closes the owning handle first, so the deletion is not blocked by a
 * live connection. A missing database deletes as a no-op.
 */
function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // A blocked delete still completes once the (now-closing) connection drops,
    // firing onsuccess afterwards; wait for that rather than resolving early.
  });
}

/** One open document the service is managing: its handle and its untrack fn. */
interface OpenEntry {
  handle: DocumentHandle;
  untrack: () => void;
}

/**
 * Opens the document service, binding it to the local registry and document
 * stores. The service owns the registry instance for its lifetime.
 *
 * Nothing here awaits the network.
 */
export function openDocumentService(): DocumentService {
  const registry: DocumentRegistry = openRegistry();
  const open = new Map<string, OpenEntry>();
  let closed = false;

  const ensureReady = registry.whenLoaded;

  const assertOpen = () => {
    if (closed) {
      throw new Error("DocumentService: the service is closed");
    }
  };

  /** Opens a handle for `id`, tracks it, and caches it. Assumes id is unopened. */
  const trackAndCache = (id: string, kind: DocumentKind): DocumentHandle => {
    const handle = openDocument({ id, kind });
    const untrack = registry.track(handle);
    open.set(id, { handle, untrack });
    return handle;
  };

  const service: DocumentService = {
    whenReady: ensureReady,
    get closed() {
      return closed;
    },

    async create(input) {
      assertOpen();
      await ensureReady;
      const id = mintId();
      registry.add({ id, kind: input.kind, title: input.title });
      return trackAndCache(id, input.kind);
    },

    async open(id) {
      assertOpen();
      await ensureReady;
      const existing = open.get(id);
      if (existing) return existing.handle;

      const entry = registry.get(id);
      if (!entry) {
        throw new Error(`DocumentService.open: no document registered with id "${id}"`);
      }
      return trackAndCache(id, entry.kind);
    },

    async list() {
      assertOpen();
      await ensureReady;
      return registry.list();
    },

    async rename(id, title) {
      assertOpen();
      await ensureReady;
      return registry.updateTitle(id, title);
    },

    subscribe(listener) {
      assertOpen();
      return registry.subscribe(listener);
    },

    async remove(id) {
      assertOpen();
      await ensureReady;
      // Close and untrack the live handle first so its IndexedDB connection is
      // released and the content-database delete is not blocked.
      const entry = open.get(id);
      if (entry) {
        entry.untrack();
        await entry.handle.close();
        open.delete(id);
      }
      registry.remove(id);
      await deleteDatabase(documentDbName(id));
    },

    async close() {
      if (closed) return;
      closed = true;
      for (const entry of open.values()) {
        entry.untrack();
        await entry.handle.close();
      }
      open.clear();
      await registry.close();
    },
  };

  return service;
}
