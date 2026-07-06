/**
 * Recent-documents query over the local document registry.
 *
 * The registry ({@link DocumentRegistry.list}) already exposes every document's
 * metadata ordered by last-edited time, most recent first, read synchronously
 * from local IndexedDB once loaded. This is the small read-only seam layered on
 * top of it: "give me the most recently edited documents, optionally of certain
 * kinds, optionally capped." It feeds recency surfaces such as the launch
 * dashboard's Resume/Recent zone.
 *
 * It is a **pure data seam**: it derives nothing new about ordering (it consumes
 * `list()`'s documented recency order rather than re-sorting, the same way the
 * ToC never re-derives outline structure), does no I/O of its own, and is fully
 * synchronous and local. It reads only through a `list()` method, so it composes
 * with the real registry or any synchronous list source in tests.
 */
import type { DocumentKind } from "../core";
import type { RegistryEntry } from "./entry";
import type { DocumentRegistry } from "./registry";

/** How to narrow and cap a {@link recentDocuments} listing. */
export interface RecentDocumentsQuery {
  /**
   * Restrict to one kind, or any of several kinds (e.g. flow sheets and block
   * files). Omit to include every kind.
   */
  kind?: DocumentKind | readonly DocumentKind[];
  /**
   * Cap the number returned to the most recent `limit` entries. Omit (or a
   * non-positive value) for no cap. Applied after filtering, so a limit of N
   * yields the N most recent documents matching the kind filter.
   */
  limit?: number;
}

/**
 * The recently-edited documents, most recent first, optionally filtered by kind
 * and capped by `limit`.
 *
 * Reads synchronously from the given source's `list()` (the registry's
 * last-edited-descending, stably tie-broken listing); filtering and capping
 * preserve that order. Purely local - no network, no async - so it is safe to
 * call on any render or read path.
 *
 * @param source Anything exposing the registry's synchronous `list()` - a live
 *   {@link DocumentRegistry} in the app, or a stub in tests.
 */
export function recentDocuments(
  source: Pick<DocumentRegistry, "list">,
  query: RecentDocumentsQuery = {},
): RegistryEntry[] {
  const { kind, limit } = query;

  let entries = source.list();

  if (kind !== undefined) {
    const kinds = Array.isArray(kind) ? kind : [kind];
    entries = entries.filter((entry) => kinds.includes(entry.kind));
  }

  if (limit !== undefined && limit > 0 && entries.length > limit) {
    entries = entries.slice(0, limit);
  }

  return entries;
}
