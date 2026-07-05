import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRounds } from "../rounds";

/**
 * The rounds index: the list of existing rounds plus a way to start a new one.
 *
 * Starting a round creates a fresh, empty flow-sheet document and navigates
 * straight to its canvas; each existing round links to its own persisted flow
 * sheet. Round management beyond this (metadata editing, list polish) is out of
 * scope - this is the minimal navigation onto the round-scoped flow sheet.
 */
export default function RoundsScreen() {
  const { rounds, createRound } = useRounds();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const startRound = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createRound();
      navigate(`/rounds/${id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <section aria-labelledby="screen-heading" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2
            id="screen-heading"
            className="text-2xl font-semibold tracking-tight text-shell-text"
          >
            Rounds
          </h2>
          <p className="max-w-prose text-sm text-shell-muted">
            Flow live rounds and review past debates from here.
          </p>
        </div>
        <button
          type="button"
          onClick={startRound}
          disabled={creating}
          className="shrink-0 rounded-md bg-shell-text px-4 py-2 text-sm font-medium text-shell-surface disabled:opacity-40"
        >
          New round
        </button>
      </div>

      {rounds.length === 0 ? (
        <p className="text-sm text-shell-muted">
          No rounds yet. Start one to open a fresh flow sheet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rounds.map((round) => (
            <li key={round.id}>
              <Link
                to={`/rounds/${round.id}`}
                className="flex items-center justify-between rounded-md border border-shell-border bg-shell-surface px-4 py-3 text-sm text-shell-text transition-colors hover:border-shell-text"
              >
                <span className="font-medium">{round.title}</span>
                <span className="text-xs text-shell-muted">
                  Edited {new Date(round.lastEditedAt).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
