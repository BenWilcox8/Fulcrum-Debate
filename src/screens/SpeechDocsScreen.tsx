import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSpeechDocs } from "../speech-doc";

/**
 * The speech docs index: the list of existing speech docs plus a way to start a
 * new one.
 *
 * Starting a speech doc creates a fresh, empty `speech-doc` document and
 * navigates straight to its editor; each existing speech doc links to its own
 * persisted body. This is the minimal navigation surface onto the speech-doc
 * editor - the split-screen docking layout is a later slice.
 */
export default function SpeechDocsScreen() {
  const { speechDocs, createSpeechDoc } = useSpeechDocs();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const startSpeechDoc = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createSpeechDoc();
      navigate(`/speeches/${id}`);
    } catch {
      console.error("Could not create speech doc");
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
            Speeches
          </h2>
          <p className="max-w-prose text-sm text-shell-muted">
            Draft and read speeches from here.
          </p>
        </div>
        <button
          type="button"
          onClick={startSpeechDoc}
          disabled={creating}
          className="shrink-0 rounded-md bg-shell-text px-4 py-2 text-sm font-medium text-shell-surface disabled:opacity-40"
        >
          New speech
        </button>
      </div>

      {speechDocs.length === 0 ? (
        <p className="text-sm text-shell-muted">
          No speeches yet. Start one to open a fresh speech doc.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {speechDocs.map((speechDoc) => (
            <li key={speechDoc.id}>
              <Link
                to={`/speeches/${speechDoc.id}`}
                className="flex items-center justify-between rounded-md border border-shell-border bg-shell-surface px-4 py-3 text-sm text-shell-text transition-colors hover:border-shell-text"
              >
                <span className="font-medium">{speechDoc.title}</span>
                <span className="text-xs text-shell-muted">
                  Edited {new Date(speechDoc.lastEditedAt).toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
