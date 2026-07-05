/**
 * React integration for the document service: a provider that owns one
 * app-lifetime {@link DocumentService} and the hooks that drive it.
 *
 * - {@link DocumentsProvider} creates the service on mount, closes it on unmount,
 *   and renders children immediately (nothing on the boot path awaits network).
 * - {@link useDocuments} exposes the live, recency-ordered listing plus the
 *   create / rename / remove mutations.
 * - {@link useDocument} opens one document by id and re-renders on its edits.
 * - {@link useDocumentService} hands back the raw service for advanced use.
 *
 * Everything composes the service seam; React code never touches the core or
 * registry primitives, Yjs, or y-indexeddb directly.
 */
export { DocumentsProvider } from "./DocumentsProvider";
export { useDocumentService } from "./useDocumentService";
export { useDocuments, type UseDocumentsResult } from "./useDocuments";
export { useDocument, type UseDocumentResult } from "./useDocument";
export type { DocumentsContextValue } from "./DocumentsContext";
