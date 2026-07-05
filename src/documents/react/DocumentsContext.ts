import { createContext } from "react";
import type { DocumentService } from "../service";

/** Value exposed by {@link DocumentsProvider} through the document hooks. */
export interface DocumentsContextValue {
  /**
   * The single app-lifetime {@link DocumentService} instance. Created when the
   * provider mounts and closed when it unmounts; every hook drives this one
   * service so features never touch the core/registry primitives directly.
   */
  service: DocumentService;
}

/**
 * Undefined outside a provider so the hooks can fail loudly rather than hand
 * back a service that will never be closed or observed.
 */
export const DocumentsContext = createContext<DocumentsContextValue | undefined>(
  undefined,
);
