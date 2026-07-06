import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { useSpeechDocs } from "../speech-doc";

/**
 * The create-and-redirect route for starting a fresh speech doc from anywhere in
 * the shell.
 *
 * Mirrors {@link ./NewRoundScreen}: creation needs the document service (below
 * the router), so a boot-path caller just navigates here and this off-boot-path
 * screen owns the create. It creates one empty `speech-doc` document through the
 * speech-doc seam ({@link useSpeechDocs}) and immediately redirects (replacing
 * history, so Back skips this transient step) to that speech doc's editor.
 * Nothing awaits the network; the create resolves from the local registry.
 */
export default function NewSpeechDocScreen() {
  const { createSpeechDoc, loading } = useSpeechDocs();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    // Wait for the local listing so the auto-generated title numbers off the
    // real count, and guard so StrictMode's double-invoke creates just one.
    if (loading || started.current) return;
    started.current = true;

    let active = true;
    void (async () => {
      try {
        const id = await createSpeechDoc();
        if (active) navigate(`/speeches/${id}`, { replace: true });
      } catch (error) {
        console.error("Could not create speech doc", error);
        if (active) navigate("/speeches", { replace: true });
      }
    })();

    return () => {
      active = false;
    };
  }, [loading, createSpeechDoc, navigate]);

  return (
    <section
      aria-labelledby="screen-heading"
      className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
    >
      <h2 id="screen-heading" className="text-lg font-medium text-shell-text">
        Creating speech…
      </h2>
      <p className="text-sm text-shell-muted">Opening a fresh speech doc.</p>
    </section>
  );
}
