import ResumeRecentZone from "./dashboard/ResumeRecentZone";
import StartSomethingNewZone from "./dashboard/StartSomethingNewZone";
import LibraryNavZone from "./dashboard/LibraryNavZone";

/**
 * The dashboard is the prep-centric home screen and the app's default landing
 * route. It renders synchronously from local data with no spinner or connecting
 * state ever, upholding the local-first boot guarantee (see AGENTS.md).
 *
 * Three zones, in descending prominence:
 *  1. {@link ResumeRecentZone} - pick up in-progress prep (most prominent).
 *  2. {@link StartSomethingNewZone} - create a fresh round or block file.
 *  3. {@link LibraryNavZone} - persistent links into the standing app areas.
 *
 * This slice ships the layout shell. The Resume list and the create-action
 * wiring are owned by sibling issues; their zone components are clean slots.
 */
export default function DashboardScreen() {
  return (
    <section
      aria-labelledby="screen-heading"
      className="mx-auto flex w-full max-w-4xl flex-col gap-section"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="screen-heading"
          className="text-2xl font-semibold tracking-tight text-shell-text"
        >
          Dashboard
        </h2>
        <p className="max-w-prose text-sm text-shell-muted">
          Pick up where you left off, or start something new.
        </p>
      </div>

      <ResumeRecentZone />
      <StartSomethingNewZone />
      <LibraryNavZone />
    </section>
  );
}
