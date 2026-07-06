/**
 * The Resume/Recent zone - the dashboard's most prominent area, where the user
 * picks up their in-progress prep. This slice ships the framed slot only; a
 * sibling issue fills it with the live recent-items list (sourced from a
 * documents-layer query). Keep this component as the clean seam for that work:
 * swap the placeholder body below for the real list.
 */
export default function ResumeRecentZone() {
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

      {/* Placeholder slot: a sibling issue renders the recent-items list here. */}
      <div className="rounded-lg border border-dashed border-shell-border px-card py-8 text-center text-sm text-shell-muted">
        Your recent rounds and block files will appear here.
      </div>
    </section>
  );
}
