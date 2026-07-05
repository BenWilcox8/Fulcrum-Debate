/**
 * Public surface of the document service - the single API feature code uses for
 * document lifecycle (create / open / list / rename / delete).
 *
 * The service composes the document core (content) and the registry (metadata)
 * into one seam; features import from here and never touch Yjs, y-indexeddb, or
 * the core/registry primitives directly. See {@link ./service} for the design
 * notes. React hooks that drive this service are a separate task.
 */
export {
  openDocumentService,
  type DocumentService,
  type CreateDocumentInput,
} from "./service";
export { type RegistryEntry } from "../registry";
export { type DocumentKind } from "../core";
