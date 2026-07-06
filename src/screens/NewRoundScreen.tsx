import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useRounds } from "../rounds";

/**
 * The create-and-redirect route for starting a fresh round from anywhere in the
 * shell (e.g. the dashboard's "New round" action).
 *
 * Round creation needs the document service, which lives below the router - so
 * rather than have the boot-path dashboard hold the service, the dashboard just
 * navigates here and this off-boot-path screen owns the create. It creates one
 * empty flow-sheet document through the round lifecycle seam ({@link useRounds})
 * and immediately redirects (replacing history, so Back skips this transient
 * step) to that round's canvas. Nothing awaits the network; the create resolves
 * from the local registry.
 */
export default function NewRoundScreen() {
  const { createRound, loading } = useRounds();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    // Wait for the local listing so the auto-generated round title numbers off
    // the real count, and guard so StrictMode's double-invoke creates just one.
    if (loading || started.current) return;
    started.current = true;

    let active = true;
    void (async () => {
      try {
        const id = await createRound();
        if (active) navigate(`/rounds/${id}`, { replace: true });
      } catch (error) {
        console.error("Could not create round", error);
        // Fall back to the rounds index rather than strand the user here.
        if (active) navigate("/rounds", { replace: true });
      }
    })();

    return () => {
      active = false;
    };
  }, [loading, createRound, navigate]);

  return (
    <section
      aria-labelledby="screen-heading"
      className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
    >
      <h2
        id="screen-heading"
        className="text-lg font-medium text-shell-text"
      >
        Creating round…
      </h2>
      <p className="text-sm text-shell-muted">Opening a fresh flow sheet.</p>
    </section>
  );
}
