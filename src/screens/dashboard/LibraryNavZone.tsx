import { Link } from "react-router-dom";

/** The persistent library destinations reachable from the dashboard. */
const LIBRARY_LINKS = [
  {
    to: "/blocks",
    label: "Block File",
    blurb: "Your affirmative and negative block library.",
  },
  {
    to: "/rounds",
    label: "Rounds",
    blurb: "Flow live rounds and review past debates.",
  },
  {
    to: "/speeches",
    label: "Speeches",
    blurb: "Draft and read the speeches you deliver.",
  },
] as const;

/**
 * The Library/Navigation zone - the dashboard's persistent map into the app's
 * standing areas. It links to every top-level content area a debater keeps work
 * in: the Block File, Rounds, and Speeches screens. These are real navigation,
 * distinct from the primary nav chrome, giving the home screen a durable way
 * into the library.
 */
export default function LibraryNavZone() {
  return (
    <section
      aria-labelledby="dashboard-library-heading"
      className="flex flex-col gap-card"
    >
      <div className="flex flex-col gap-1">
        <h3
          id="dashboard-library-heading"
          className="text-lg font-semibold tracking-tight text-shell-text"
        >
          Library
        </h3>
        <p className="text-sm text-shell-muted">
          Everything you have, always one click away.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {LIBRARY_LINKS.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="flex flex-col gap-0.5 rounded-md border border-shell-border bg-shell-surface px-4 py-3 transition-colors hover:border-shell-text"
            >
              <span className="text-sm font-medium text-shell-text">
                {link.label}
              </span>
              <span className="text-xs text-shell-muted">{link.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
