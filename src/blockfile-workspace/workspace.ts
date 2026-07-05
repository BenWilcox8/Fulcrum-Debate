import { useEffect, useState } from "react";
import {
  useDocument,
  useDocumentService,
  type UseDocumentResult,
} from "../documents/react";
import type { DocumentService } from "../documents/service";

/**
 * The block file as an app-shell workspace singleton.
 *
 * A block file is a debater's evidence store, and - for now - there is exactly
 * **one block file per workspace**. Multiple block files are deliberately out of
 * scope, so rather than an index-and-pick flow (as rounds have), the shell opens
 * *the* block file: the single `block-file` {@link ../documents | document}, lazily
 * created the first time it is opened and reused forever after.
 *
 * This maps the singleton onto the existing document layer with no new
 * infrastructure - the block file is just a `block-file` document in the shared
 * registry/service, identified by kind rather than by a user-managed id. Making
 * the identity kind-scoped (not a hard-coded id) keeps it extensible: a later
 * multi-block-file PRD can list every `block-file` document and drop the
 * "first one" convention without a migration, because the documents are already
 * ordinary registry entries.
 */
export const BLOCK_FILE_KIND = "block-file" as const;

/** The title the workspace block file is created with. */
export const BLOCK_FILE_TITLE = "Block File";

/**
 * One in-flight ensure promise per {@link DocumentService}.
 *
 * Resolving the singleton reads the listing and, if empty, creates the document.
 * Both React StrictMode's double-invoked effects and a quick navigate-away/back
 * can run the effect again before the freshly created entry appears in the
 * listing, which would create a *second* block file. Keying the resolution
 * promise to the service (which the {@link DocumentsProvider} owns for the app's
 * lifetime) collapses those concurrent attempts onto one create, so the workspace
 * ends up with exactly one block file. The map is a `WeakMap` so a closed service
 * (e.g. a StrictMode-recreated one) is not retained.
 */
const ensurePromises = new WeakMap<DocumentService, Promise<string>>();

/**
 * Resolves the id of the workspace's single block-file document, creating it on
 * first use. Awaits only the service's local registry load and its own
 * create/list - never the network - so a caller stays within the local-first
 * boot rule.
 */
export function ensureBlockFile(service: DocumentService): Promise<string> {
  let pending = ensurePromises.get(service);
  if (!pending) {
    pending = (async () => {
      await service.whenReady;
      const existing = (await service.list()).find(
        (entry) => entry.kind === BLOCK_FILE_KIND,
      );
      if (existing) return existing.id;
      const handle = await service.create({
        kind: BLOCK_FILE_KIND,
        title: BLOCK_FILE_TITLE,
      });
      return handle.id;
    })();
    // On failure, drop the cached rejection so a later mount can retry.
    pending.catch(() => ensurePromises.delete(service));
    ensurePromises.set(service, pending);
  }
  return pending;
}

/** What {@link useBlockFile} returns. */
export interface UseBlockFileResult extends UseDocumentResult {
  /**
   * `true` until the singleton's id has been resolved (its local registry read,
   * plus a create on first use). Once `false`, `handle`/`loaded` follow the usual
   * {@link useDocument} contract as the content loads.
   */
  resolving: boolean;
  /** Set when `ensureBlockFile` fails for a reason other than service closure. */
  error: Error | null;
  /** Increment the internal retry counter so the effect re-runs `ensureBlockFile`. */
  retry: () => void;
}

/**
 * Opens the workspace's single block-file document, creating it on first use.
 *
 * Layers on {@link ensureBlockFile} to find-or-create the singleton, then opens
 * it through the shared document service ({@link useDocument}) - so edits persist
 * locally and restore on reopen like any other document. Nothing here awaits the
 * network; the screen can paint synchronously and fill in the editor once the
 * local load resolves.
 */
export function useBlockFile(): UseBlockFileResult {
  const service = useDocumentService();
  const [id, setId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setResolving(true);
    setError(null);
    ensureBlockFile(service)
      .then((resolvedId) => {
        if (!active) return;
        setId(resolvedId);
        setResolving(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (service.closed) {
          // The service was closed mid-flight (e.g. a StrictMode remount); a
          // fresh service will re-run this effect via the `service` dep change.
          return;
        }
        setResolving(false);
        setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      active = false;
    };
  }, [service, retryCount]);

  const document = useDocument(id);
  return { ...document, resolving, error, retry: () => setRetryCount((n) => n + 1) };
}
