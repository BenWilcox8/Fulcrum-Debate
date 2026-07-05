import { useContext } from "react";
import { DocumentsContext } from "./DocumentsContext";
import type { DocumentService } from "../service";

/**
 * Accesses the app-lifetime {@link DocumentService} from the nearest
 * {@link DocumentsProvider}. Throws when used outside a provider so the mistake
 * surfaces immediately instead of silently using an unmanaged service.
 *
 * Most feature code should prefer the higher-level {@link useDocuments} /
 * {@link useDocument} hooks; reach for this only when you need the raw service.
 */
export function useDocumentService(): DocumentService {
  const value = useContext(DocumentsContext);
  if (value === undefined) {
    throw new Error("useDocumentService must be used within a DocumentsProvider");
  }
  return value.service;
}
