import { useEffect } from "react";
import type { DocumentHandle } from "../documents/core";
import { DocumentEditor } from "../editor/react";
import { SPEECH_DOC_BODY_FRAGMENT } from "./speech-doc";
import { useActiveSpeechDoc } from "./active-speech-doc-context";

/** Props for {@link SpeechDocEditor}. */
export interface SpeechDocEditorProps {
  /**
   * The `speech-doc` document whose body this editor edits. `null` while the
   * document is opening - the surface paints synchronously and the editable view
   * mounts once the handle's local load resolves.
   */
  handle: DocumentHandle | null;
  /**
   * The speech doc's id (its document id). Mounting an editor for it marks it as
   * the {@link useActiveSpeechDoc | active speech doc} - the target content
   * pipelines push into. Omit only where activation is undesired.
   */
  docId?: string | null;
  /** Class applied to the editor's container element. */
  className?: string;
}

/**
 * The **Speech Doc editor**: a shared-Tiptap-core instance bound to a
 * `speech-doc` document's {@link SPEECH_DOC_BODY_FRAGMENT} body fragment through
 * the plain {@link ../editor/preset | editorPreset} (bold, highlight, font size,
 * headings - so rich text like bold taglines works). Content autosaves and
 * reloads through the same Yjs + y-indexeddb path as every other text surface;
 * this component adds no bespoke storage.
 *
 * Mounting the editor for a speech doc marks that doc as the **active speech
 * doc** (the shared target for content pipelines), so the doc a debater is
 * editing is the one Send-Flow / ToC / drag-to-speech push into. Activation is
 * provider-tolerant: with no {@link ./ActiveSpeechDocProvider} it sets the active
 * id on a private fallback store, so a bare editor still renders.
 *
 * This editor is hosted both on its own route ({@link ../screens/SpeechDocScreen})
 * and, docked beside the flow sheet, by
 * {@link ./dock/SpeechDock | the split-screen dock}.
 */
export function SpeechDocEditor({ handle, docId, className }: SpeechDocEditorProps) {
  const { setActiveId } = useActiveSpeechDoc();

  useEffect(() => {
    if (docId) setActiveId(docId);
  }, [docId, setActiveId]);

  return (
    <div data-testid="speech-doc-editor" className={className}>
      <DocumentEditor
        handle={handle}
        fragment={SPEECH_DOC_BODY_FRAGMENT}
        className="speech-doc-body min-h-full rounded border border-shell-border bg-shell-surface px-4 py-3 text-shell-text focus-within:border-shell-muted"
      />
    </div>
  );
}
