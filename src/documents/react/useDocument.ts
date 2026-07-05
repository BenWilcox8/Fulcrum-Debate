import { useEffect, useState } from "react";
import { useDocumentService } from "./useDocumentService";
import type { DocumentHandle } from "../core";

/** What {@link useDocument} returns for a given id. */
export interface UseDocumentResult {
  /**
   * The live handle for the requested id, or `null` while it is opening (or when
   * no id / an unregistered id was passed). Read and mutate shared types off
   * `handle.doc`.
   */
  handle: DocumentHandle | null;
  /**
   * Whether the document's content has finished loading from local IndexedDB.
   * `false` until `handle.whenLoaded` resolves; wait for this before editing
   * shared types.
   */
  loaded: boolean;
  /**
   * Increments on every local content change to the open document. Consumers do
   * not need to read it - the change re-renders the component so a fresh read of
   * `handle.doc` reflects the edit - but it makes the reactive dependency
   * explicit for memoised derivations.
   */
  version: number;
}

/**
 * Opens the document with `id` through the app's {@link DocumentService} and
 * keeps the component in sync with it: exposes the live handle and its loaded
 * state, and re-renders on every local content change.
 *
 * The service owns the handle (one cached handle per id, closed by the service
 * on `remove` / `close`), so this hook deliberately does **not** close it on
 * unmount - doing so would break other consumers sharing the same handle. It
 * only detaches its own content listener when the component unmounts or `id`
 * changes.
 *
 * Passing a nullish `id` yields a null handle and attaches nothing, so it is
 * safe to call unconditionally (e.g. `useDocument(selectedId)`).
 */
export function useDocument(id: string | null | undefined): UseDocumentResult {
  const service = useDocumentService();
  const [handle, setHandle] = useState<DocumentHandle | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setHandle(null);
    setLoaded(false);

    if (!id) return;

    let active = true;
    let detach: (() => void) | null = null;

    service
      .open(id)
      .then((opened) => {
        if (!active) return;
        setHandle(opened);
        setLoaded(opened.loaded);
        opened.whenLoaded.then(() => {
          if (active) setLoaded(true);
        });

        const onUpdate = () => {
          if (active) setVersion((v) => v + 1);
        };
        opened.doc.on("update", onUpdate);
        detach = () => opened.doc.off("update", onUpdate);
      })
      .catch(() => {
        // Unregistered id (or the service was closed): leave handle null.
      });

    return () => {
      active = false;
      // Only our own listener is released here. The handle itself is owned and
      // reused by the service, so closing it is not this hook's responsibility.
      detach?.();
    };
  }, [service, id]);

  return { handle, loaded, version };
}
