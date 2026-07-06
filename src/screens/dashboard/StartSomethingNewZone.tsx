/**
 * The Start Something New zone - the dashboard's create-actions area. This slice
 * ships the action buttons as inert placeholders; a sibling issue wires each to
 * the create/open flow (spin up a fresh round or block file and navigate to it).
 * Keep these buttons as the seam for that work: add the handlers, do not rebuild
 * the layout.
 */
export default function StartSomethingNewZone() {
  return (
    <section
      aria-labelledby="dashboard-start-heading"
      className="flex flex-col gap-card"
    >
      <div className="flex flex-col gap-1">
        <h3
          id="dashboard-start-heading"
          className="text-lg font-semibold tracking-tight text-shell-text"
        >
          Start something new
        </h3>
        <p className="text-sm text-shell-muted">
          Spin up a fresh workspace and get prepping.
        </p>
      </div>

      {/* Placeholder actions: a sibling issue wires the create/open handlers. */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-md bg-shell-text px-4 py-2 text-sm font-medium text-shell-surface"
        >
          New round
        </button>
        <button
          type="button"
          className="rounded-md border border-shell-border bg-shell-surface px-4 py-2 text-sm font-medium text-shell-text transition-colors hover:border-shell-text"
        >
          New block file
        </button>
      </div>
    </section>
  );
}
