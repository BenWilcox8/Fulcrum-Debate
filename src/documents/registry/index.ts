/**
 * Public surface of the local document registry.
 *
 * The registry indexes document *metadata* (id, kind, title, created and
 * last-edited times) in one locally-persisted store, built on the document
 * core's y-indexeddb binding. See {@link ./registry} for the full design notes.
 * The service API and React hooks that drive these primitives are separate
 * tasks and live elsewhere.
 *
 * Also exports {@link recentDocuments} - the synchronous, local-only read seam
 * for recency surfaces (e.g. the launch dashboard's Resume/Recent zone). It
 * filters and caps the registry's last-edited-descending listing without
 * re-sorting it.
 */
export {
  openRegistry,
  REGISTRY_DB_NAME,
  type DocumentRegistry,
} from "./registry";
export type { RegistryEntry, AddEntryInput } from "./entry";
export { recentDocuments, type RecentDocumentsQuery } from "./query";
