import { Link, useParams } from "react-router-dom";
import { FlowSheetPanel } from "../flow/canvas";
import { useDocument } from "../documents/react";
import { useRounds } from "../rounds";

/**
 * A single round's flow sheet.
 *
 * The `:roundId` route param is the round's stable id, which is exactly the
 * backing flow-sheet document's id. We open that document through the shared
 * document service ({@link useDocument}) and hand its handle to
 * {@link FlowSheetPanel}; the panel paints synchronously and fills in the
 * round's own columns once its local IndexedDB load resolves, so nothing here
 * awaits the network. Because each round is a separate document, the columns are
 * this round's alone.
 */
export default function RoundScreen() {
  const { roundId } = useParams<{ roundId: string }>();
  const { handle } = useDocument(roundId);
  const { rounds } = useRounds();
  const title = rounds.find((round) => round.id === roundId)?.title ?? "Round";

  return (
    <section
      aria-labelledby="screen-heading"
      className="flex h-[calc(100vh-9rem)] flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            to="/rounds"
            className="text-xs font-medium text-shell-muted hover:text-shell-text"
          >
            ← All rounds
          </Link>
          <h2
            id="screen-heading"
            className="text-2xl font-semibold tracking-tight text-shell-text"
          >
            {title}
          </h2>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-shell-border bg-shell-surface">
        <FlowSheetPanel handle={handle} />
      </div>
    </section>
  );
}
