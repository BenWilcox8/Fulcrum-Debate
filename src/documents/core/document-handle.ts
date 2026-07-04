/**
 * The core local document abstraction for Fulcrum Debate.
 *
 * Every artifact a debater creates - a flow sheet, a speech doc, a block file -
 * is a Yjs document ({@link https://docs.yjs.dev | Y.Doc}) persisted locally to
 * IndexedDB via {@link https://github.com/yjs/y-indexeddb | y-indexeddb}. This
 * module wraps a `Y.Doc` and its IndexedDB persistence provider into a single
 * {@link DocumentHandle} that carries a stable id and a {@link DocumentKind},
 * exposes a local-only "initial load complete" signal, and owns a clean
 * close/teardown lifecycle.
 *
 * This is the foundation only. Deduplicating handles by id, a service API, and
 * React hooks are separate follow-up tasks and deliberately live elsewhere;
 * opening the same id twice here yields two independent handles on the same
 * underlying store.
 *
 * ## Local-first, never network
 *
 * IndexedDB is local browser/webview storage. Nothing here awaits a network
 * resource, and the load-complete signal ({@link DocumentHandle.whenLoaded})
 * reflects local persistence success alone - it is a first-class state that is
 * entirely independent of any future sync/network layer.
 *
 * ## Shared-type layout
 *
 * This layer imposes no schema. Callers read and mutate Yjs shared types
 * directly off {@link DocumentHandle.doc} (e.g. `handle.doc.getText("body")`,
 * `handle.doc.getMap("meta")`). The concrete shared-type layout for each kind
 * is deliberately deferred to the feature tasks that own those artifacts; a
 * later task documents the agreed conventions in AGENTS.md.
 */
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";

import type { DocumentKind } from "./kind";

/**
 * Namespace prefix for every document's IndexedDB database name.
 *
 * The persistence provider is keyed per document id, so each document lives in
 * its own IndexedDB database. The prefix keeps those databases in one obvious
 * namespace and avoids collisions with any other IndexedDB usage.
 */
export const DOCUMENT_DB_PREFIX = "fulcrum:doc:";

/** Options for opening (or creating) a document. */
export interface OpenDocumentOptions {
  /**
   * Stable, unique document id. Two handles opened with the same id share the
   * same on-disk store, so reopening an id restores its content. Must be
   * non-empty.
   */
  id: string;
  /** The artifact kind this document represents. */
  kind: DocumentKind;
}

/**
 * A live handle to one locally-persisted Yjs document.
 *
 * Obtain one from {@link openDocument}. Mutate content through Yjs shared types
 * on {@link doc}. Always {@link close} the handle when done to release the
 * IndexedDB connection and the doc without leaking listeners.
 */
export interface DocumentHandle {
  /** The stable document id this handle was opened with. */
  readonly id: string;
  /** The artifact kind this document represents. */
  readonly kind: DocumentKind;
  /** The underlying Yjs document. Access shared types directly off this. */
  readonly doc: Y.Doc;
  /** The IndexedDB database name backing this document. */
  readonly dbName: string;
  /**
   * Resolves once the document's initial content has been loaded from local
   * IndexedDB storage (the provider's local `whenSynced`). This is a purely
   * local signal: it never involves the network and fires even fully offline.
   * If the handle is closed before the initial load completes, this promise
   * never resolves.
   */
  readonly whenLoaded: Promise<void>;
  /**
   * Whether the initial local load has completed. Starts `false` and flips to
   * `true` when {@link whenLoaded} resolves.
   */
  readonly loaded: boolean;
  /** Whether {@link close} has been called on this handle. */
  readonly closed: boolean;
  /**
   * Tears the handle down: detaches the persistence provider, closes the
   * IndexedDB connection, and destroys the `Y.Doc`. Idempotent. Any pending
   * IndexedDB writes still commit before the connection closes, so a closed
   * handle can be reopened (same id) with identical content.
   */
  close(): Promise<void>;
}

/** Derives the IndexedDB database name for a document id. */
export function documentDbName(id: string): string {
  return `${DOCUMENT_DB_PREFIX}${id}`;
}

/**
 * Opens (creating if absent) a locally-persisted document.
 *
 * Constructs a fresh `Y.Doc`, binds an {@link IndexeddbPersistence} provider
 * keyed to the document id, and returns a {@link DocumentHandle}. Content is
 * loaded from IndexedDB asynchronously; await {@link DocumentHandle.whenLoaded}
 * to know when the stored state has been applied.
 *
 * Nothing on this path awaits the network.
 */
export function openDocument(options: OpenDocumentOptions): DocumentHandle {
  const { id, kind } = options;
  if (id.length === 0) {
    throw new Error("openDocument: id must be a non-empty string");
  }

  const dbName = documentDbName(id);
  const doc = new Y.Doc();
  const provider = new IndexeddbPersistence(dbName, doc);

  let loaded = false;
  let closed = false;

  // Resolves from the provider's *local* synced signal only. y-indexeddb
  // resolves `whenSynced` after it has read the persisted updates out of
  // IndexedDB and applied them to the doc - no network is ever involved.
  const whenLoaded = provider.whenSynced.then(() => {
    loaded = true;
  });

  const handle: DocumentHandle = {
    id,
    kind,
    doc,
    dbName,
    whenLoaded,
    get loaded() {
      return loaded;
    },
    get closed() {
      return closed;
    },
    async close() {
      if (closed) return;
      closed = true;
      // Detach the update/destroy listeners and close the IndexedDB
      // connection. `db.close()` defers the actual close until in-flight
      // write transactions commit, so no pending edit is lost.
      await provider.destroy();
      // Free the doc and its observers. (Destroying the doc also emits
      // `destroy`, which re-invokes the provider's now-idempotent destroy.)
      doc.destroy();
    },
  };

  return handle;
}
