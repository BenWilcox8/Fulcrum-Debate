import { useCallback, useEffect, useState } from "react";
import { useDocumentService } from "./useDocumentService";
import type { CreateDocumentInput, RegistryEntry } from "../service";
import type { DocumentHandle } from "../core";

/** What {@link useDocuments} returns: the live listing plus the mutations. */
export interface UseDocumentsResult {
  /**
   * All documents' metadata, ordered by last-edited time (most recent first).
   * Empty until the registry's local load resolves, then kept live: it
   * re-renders on every create / rename / touch / remove.
   */
  documents: RegistryEntry[];
  /** `true` until the first listing has been read from the local store. */
  loading: boolean;
  /** Creates a document and returns its open handle. See {@link DocumentService.create}. */
  create: (input: CreateDocumentInput) => Promise<DocumentHandle>;
  /** Renames a document. See {@link DocumentService.rename}. */
  rename: (id: string, title: string) => Promise<RegistryEntry>;
  /** Deletes a document and its content. See {@link DocumentService.remove}. */
  remove: (id: string) => Promise<void>;
}

/**
 * The live document listing plus its mutations, driven by the app's
 * {@link DocumentService}.
 *
 * Subscribes to the service so the returned {@link UseDocumentsResult.documents}
 * re-render whenever the document set changes - including changes made by other
 * consumers or by a tracked document's own edits. The mutations are stable
 * callbacks; each triggers the same subscription, so the list stays current
 * without any manual refresh.
 */
export function useDocuments(): UseDocumentsResult {
  const service = useDocumentService();
  const [documents, setDocuments] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // A closed service can transiently sit in context during a StrictMode /
    // remount cycle: the provider closes the old service, then re-renders with a
    // fresh one, and this child effect can run in between. `subscribe` throws on
    // a closed service, so bail out and wait for the provider's fresh service to
    // arrive (which re-runs this effect). This mirrors the dashboard's
    // ResumeRecentZone guard and keeps a reload that lands directly on a
    // document screen from crashing the tree.
    if (service.closed) return;

    let active = true;

    const refresh = () => {
      service
        .list()
        .then((list) => {
          if (active) {
            setDocuments(list);
            setLoading(false);
          }
        })
        .catch(() => {
          // A rejection means the service was closed mid-flight (e.g. a
          // StrictMode remount). Leave the last good listing in place.
        });
    };

    // Read once the local registry has loaded, then stay subscribed for changes.
    service.whenReady.then(refresh).catch(() => {});
    const unsubscribe = service.subscribe(refresh);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const create = useCallback(
    (input: CreateDocumentInput) => service.create(input),
    [service],
  );
  const rename = useCallback(
    (id: string, title: string) => service.rename(id, title),
    [service],
  );
  const remove = useCallback((id: string) => service.remove(id), [service]);

  return { documents, loading, create, rename, remove };
}
