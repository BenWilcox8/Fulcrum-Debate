/**
 * Public surface of the core local document layer.
 *
 * The document core wraps a Yjs `Y.Doc` plus its IndexedDB persistence into a
 * single {@link DocumentHandle}. See {@link ./document-handle} for the full
 * design notes. Higher layers (registry, service API, React hooks) build on
 * this and are separate tasks.
 */
export {
  openDocument,
  documentDbName,
  DOCUMENT_DB_PREFIX,
  type DocumentHandle,
  type OpenDocumentOptions,
} from "./document-handle";
export { DOCUMENT_KINDS, isDocumentKind, type DocumentKind } from "./kind";
