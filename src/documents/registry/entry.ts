/**
 * The metadata record the registry keeps for one document.
 *
 * The registry stores *metadata about* documents, never their content - the
 * content lives in each document's own {@link import("../core").DocumentHandle}
 * / Y.Doc. An entry is the small, listable card a debater sees before opening a
 * document: what it is, what it's called, and when it was made and last touched.
 */
import type { DocumentKind } from "../core";

/** A registry entry: the persisted metadata for one document. */
export interface RegistryEntry {
  /** The document's stable id (matches the id passed to `openDocument`). */
  readonly id: string;
  /** The artifact kind this document represents. */
  readonly kind: DocumentKind;
  /** Human-facing title, as shown in listings. */
  readonly title: string;
  /** Creation time, epoch milliseconds. Never changes after `add`. */
  readonly createdAt: number;
  /**
   * Last-edited time, epoch milliseconds. Bumped whenever the document's
   * content changes (see {@link import("./registry").DocumentRegistry.touch})
   * or its title is renamed. Listings order by this, most-recent first.
   */
  readonly lastEditedAt: number;
}

/** Fields accepted when adding a new entry (on document create). */
export interface AddEntryInput {
  /** The document's stable id. Must be non-empty and not already registered. */
  id: string;
  /** The artifact kind this document represents. */
  kind: DocumentKind;
  /** Initial title. */
  title: string;
  /**
   * Creation time, epoch milliseconds. Defaults to `Date.now()`. Exposed mainly
   * so callers (and tests) can supply a deterministic clock.
   */
  createdAt?: number;
  /**
   * Initial last-edited time, epoch milliseconds. Defaults to `createdAt` (a
   * freshly created document was last edited when it was made).
   */
  lastEditedAt?: number;
}
