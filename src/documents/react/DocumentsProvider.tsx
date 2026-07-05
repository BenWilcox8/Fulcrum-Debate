import { useEffect, useState, type ReactNode } from "react";
import { openDocumentService, type DocumentService } from "../service";
import { DocumentsContext } from "./DocumentsContext";

/**
 * Owns one {@link DocumentService} for the whole app and provides it to the
 * tree via the document hooks ({@link useDocuments}, {@link useDocument}).
 *
 * The service is created synchronously on first render (opening it awaits no
 * network - it only binds the local IndexedDB-backed registry), so children
 * render immediately with no gate or spinner. Listings are empty until the
 * registry's local load resolves; the hooks refresh when it does. The service
 * is closed when the provider unmounts.
 */
export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<DocumentService>(() =>
    openDocumentService(),
  );

  useEffect(() => {
    // React StrictMode (and any real remount) runs this effect's setup/cleanup
    // pair an extra time in development: the cleanup closes the service, so on
    // the immediately-following setup we mint a fresh one rather than leave the
    // tree holding a closed service. In production this runs once and simply
    // closes the service on unmount.
    let current = service;
    if (current.closed) {
      current = openDocumentService();
      setService(current);
    }
    return () => {
      void current.close();
    };
  }, [service]);

  return (
    <DocumentsContext.Provider value={{ service }}>
      {children}
    </DocumentsContext.Provider>
  );
}
