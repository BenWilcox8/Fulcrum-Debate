import { Link, useParams } from "react-router-dom";
import { useDocument } from "../documents/react";
import { SpeechDocEditor, useSpeechDocs } from "../speech-doc";
import { buildSpeechDocExportPayload } from "../export";
import { ExportButton } from "../export/react";

/**
 * A single speech doc's editor.
 *
 * The `:speechDocId` route param is the speech doc's stable id, which is exactly
 * the backing `speech-doc` document's id. We open that document through the
 * shared document service ({@link useDocument}) and hand its handle to
 * {@link SpeechDocEditor}, which binds the shared editor to the speech doc's body
 * and marks it the active speech doc. The surface paints synchronously and the
 * editable view mounts once the local IndexedDB load resolves, so nothing here
 * awaits the network.
 *
 * This is the standalone full-screen route for editing one speech in isolation.
 * The split-screen docking layout (the same editor docked beside the flow sheet
 * on the round screen) is {@link ../speech-doc/dock | SpeechDockLayout}.
 */
export default function SpeechDocScreen() {
  const { speechDocId } = useParams<{ speechDocId: string }>();
  const { handle } = useDocument(speechDocId);
  const { speechDocs, loading } = useSpeechDocs();

  const speechDoc = speechDocs.find((s) => s.id === speechDocId);
  const notFound = !loading && speechDocId != null && speechDoc == null;

  if (notFound) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-shell-text text-lg font-medium">Speech not found</p>
        <Link
          to="/speeches"
          className="text-sm font-medium text-shell-muted hover:text-shell-text"
        >
          ← Back to all speeches
        </Link>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="screen-heading"
      className="flex flex-1 min-h-0 flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            to="/speeches"
            className="text-xs font-medium text-shell-muted hover:text-shell-text"
          >
            ← All speeches
          </Link>
          <h2
            id="screen-heading"
            className="text-2xl font-semibold tracking-tight text-shell-text"
          >
            {speechDoc?.title ?? "Speech"}
          </h2>
        </div>

        <ExportButton
          className="shrink-0"
          disabled={!handle}
          buildPayload={() =>
            handle
              ? buildSpeechDocExportPayload(handle, speechDoc?.title)
              : null
          }
        />
      </div>

      <SpeechDocEditor
        handle={handle}
        docId={speechDocId}
        className="min-h-0 flex-1 overflow-y-auto"
      />
    </section>
  );
}
