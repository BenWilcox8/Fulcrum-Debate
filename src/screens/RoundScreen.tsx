import { Link, useParams } from "react-router-dom";
import { FlowSheetPanel, useColumns } from "../flow/canvas";
import { TimerWidget } from "../timer";
import { SpeechDockLayout } from "../speech-doc";
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
  const { rounds, loading } = useRounds();
  // The round's own speech columns drive the timer's speech selector, so it
  // reflects the actual round structure (e.g. Public-Forum "Con Case"/"Pro FF")
  // instead of the generic Policy default. Reading the labels here keeps the
  // timer widget itself self-contained - it receives them as plain data.
  const speeches = useColumns(handle).map((column) => column.label);

  const round = rounds.find((r) => r.id === roundId);
  const notFound = !loading && roundId != null && round == null;

  if (notFound) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-shell-text text-lg font-medium">Round not found</p>
        <Link
          to="/rounds"
          className="text-sm font-medium text-shell-muted hover:text-shell-text"
        >
          ← Back to all rounds
        </Link>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="screen-heading"
      className="flex flex-1 min-h-0 flex-col gap-4"
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
            {round?.title ?? "Round"}
          </h2>
        </div>
      </div>

      {/* The flow sheet lives in the primary pane; the Speech Doc editor docks
          beside it (side/bottom, resizable, preference persisted) without
          touching flowing. The floating timers are handed to the panel as its
          canvas overlay, so they float over the flow columns alone - clear of
          the column-controls strip, the RFD region, and the dock. The widget's
          own wrapper is pointer-events-none outside its card so it never blocks
          flowing. */}
      <SpeechDockLayout className="overflow-hidden rounded-lg border border-shell-border">
        <div className="h-full min-h-0 min-w-0 overflow-hidden bg-shell-surface">
          <FlowSheetPanel handle={handle} overlay={<TimerWidget speeches={speeches} />} />
        </div>
      </SpeechDockLayout>
    </section>
  );
}
