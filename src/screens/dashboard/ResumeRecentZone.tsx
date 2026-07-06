import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DocumentsContext } from "../../documents/react/DocumentsContext";
import { recentDocuments } from "../../documents/registry";
import type { DocumentKind, RegistryEntry } from "../../documents/service";

/**
 * The document kinds a debater resumes from the dashboard, and where each one
 * opens. Flow sheets open at their own round route (the round id *is* the
 * flow-sheet document id); the block file opens the single block-file
 * workspace. Any other kind (e.g. speech docs) has no editor route yet and is
 * left out of the Resume list rather than linking nowhere.
 */
const RESUMABLE_KINDS = ["flow-sheet", "block-file"] as const;

/** How many recent items the zone shows at once. */
const RESUME_LIMIT = 6;

/** The editor route that resumes a given document, by kind. */
function resumeHref(entry: RegistryEntry): string {
  return entry.kind === "flow-sheet" ? `/rounds/${entry.id}` : "/blocks";
}

/**
 * The live document listing for the Resume zone - a provider-optional reader.
 *
 * It mirrors {@link import("../../documents/react").useDocuments}, but reads the
 * {@link DocumentsContext} directly and tolerates its absence: when the zone is
 * mounted without a {@link DocumentsProvider} it returns an empty listing rather
 * than throwing. That is deliberate - production always wraps `App` in the
 * provider (see `main.tsx`), but the local-first boot test renders a bare `App`
 * with no provider (and no IndexedDB) precisely so nothing on the boot path
 * constructs a document service (see AGENTS.md "Local-first boot"). Degrading to
 * empty keeps the dashboard painting there while upholding that guarantee.
 */
function useResumeDocuments(): RegistryEntry[] {
  const service = useContext(DocumentsContext)?.service;
  const [documents, setDocuments] = useState<RegistryEntry[]>([]);

  useEffect(() => {
    // A closed service can transiently sit in context during a StrictMode /
    // remount cycle: the provider closes the old service, then re-renders with a
    // fresh one, and this child effect can run in between. `subscribe` throws on
    // a closed service, so bail out and wait for the provider's fresh service to
    // re-run this effect.
    if (!service || service.closed) return;
    let active = true;

    const refresh = () => {
      service
        .list()
        .then((list) => {
          if (active) setDocuments(list);
        })
        .catch(() => {
          // A rejection means the service was closed mid-flight (e.g. a
          // StrictMode remount); leave the last good listing in place.
        });
    };

    service.whenReady.then(refresh).catch(() => {});
    const unsubscribe = service.subscribe(refresh);

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  return documents;
}

/**
 * The Resume/Recent zone - the dashboard's most prominent area, where the user
 * picks up their in-progress prep. It reads the live document listing and
 * narrows it to the resumable kinds via the local-only {@link recentDocuments}
 * query, riding that seam's last-edited-descending order rather than re-deriving
 * it. Each entry is a one-click link straight into its editor with that
 * document open.
 *
 * Rendering stays synchronous from local data - no spinner, no network await -
 * upholding the local-first boot guarantee (see AGENTS.md). An empty registry
 * shows a plain empty state rather than a broken or blank zone.
 */
export default function ResumeRecentZone() {
  const documents = useResumeDocuments();

  // Reuse the documents-layer recency seam over the already-ordered listing,
  // narrowing to the kinds that have an editor route.
  const recent = recentDocuments(
    { list: () => documents },
    { kind: RESUMABLE_KINDS as readonly DocumentKind[], limit: RESUME_LIMIT },
  );

  return (
    <section
      aria-labelledby="dashboard-resume-heading"
      className="flex flex-col gap-card rounded-xl border border-shell-border bg-shell-surface p-card shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <h3
          id="dashboard-resume-heading"
          className="text-xl font-semibold tracking-tight text-shell-text"
        >
          Resume
        </h3>
        <p className="text-sm text-shell-muted">
          Jump back into the prep you were last working on.
        </p>
      </div>

      {recent.length === 0 ? (
        <div className="rounded-lg border border-dashed border-shell-border px-card py-8 text-center text-sm text-shell-muted">
          No recent prep yet. Your recent rounds and block files will appear
          here.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((doc) => (
            <li key={doc.id}>
              <Link
                to={resumeHref(doc)}
                aria-label={`Resume ${doc.title}`}
                className="flex items-center justify-between gap-4 rounded-md border border-shell-border bg-shell-surface px-4 py-3 text-sm text-shell-text transition-colors hover:border-shell-text"
              >
                <span className="min-w-0 truncate font-medium">
                  {doc.title}
                </span>
                <span className="shrink-0 text-xs text-shell-muted">
                  {doc.kind === "flow-sheet" ? "Flow sheet" : "Block file"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
