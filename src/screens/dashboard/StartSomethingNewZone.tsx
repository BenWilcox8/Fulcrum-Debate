import { useNavigate } from "react-router-dom";

/**
 * The Start Something New zone - the dashboard's create-actions area.
 *
 * The dashboard is the app's default landing route, so it must render on the
 * boot path without a {@link ../../documents/react DocumentsProvider} (the
 * provider is mounted outside `App`; `App.offline-boot.test.tsx` renders `App`
 * bare to prove boot is local-first). This zone therefore never touches the
 * document service directly: each action just navigates, and the destination
 * route owns the create/open primitive. This mirrors the block-file singleton,
 * whose screen already find-or-creates its document on arrival.
 *
 *  - **New round** navigates to `/rounds/new`, which creates a fresh flow-sheet
 *    document (through the round lifecycle seam) and redirects to its canvas.
 *  - **Open block file** navigates to `/blocks`, whose screen opens the
 *    workspace's single block-file document.
 *  - **New card** shares the block-file destination: a card is authored *inside*
 *    the block file (there is no standalone card editor yet), so rather than
 *    ship a dead/disabled button, this lands the debater on the block file - the
 *    surface where cards are cut - as the documented interim placeholder. When a
 *    dedicated card editor lands, only this handler changes.
 */
export default function StartSomethingNewZone() {
  const navigate = useNavigate();

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

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate("/rounds/new")}
          className="rounded-md bg-shell-text px-4 py-2 text-sm font-medium text-shell-surface transition-opacity hover:opacity-90"
        >
          New round
        </button>
        <button
          type="button"
          onClick={() => navigate("/blocks")}
          className="rounded-md border border-shell-border bg-shell-surface px-4 py-2 text-sm font-medium text-shell-text transition-colors hover:border-shell-text"
        >
          New card
        </button>
        <button
          type="button"
          onClick={() => navigate("/blocks")}
          className="rounded-md border border-shell-border bg-shell-surface px-4 py-2 text-sm font-medium text-shell-text transition-colors hover:border-shell-text"
        >
          Open block file
        </button>
      </div>
    </section>
  );
}
