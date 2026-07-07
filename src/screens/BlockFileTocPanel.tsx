import { useCallback, useContext, useState } from "react";
import type { Editor } from "@tiptap/core";

import { DocumentsContext } from "../documents/react/DocumentsContext";
import type { DocumentService } from "../documents/service";
import { sendSectionsToSpeechDoc } from "../blockfile";
import { useActiveSpeechDoc } from "../speech-doc";
import { TableOfContents, useTocSelection } from "../toc";

/**
 * Reads the app's {@link DocumentService} *tolerantly* - returns `null` outside a
 * `DocumentsProvider` instead of throwing. Mirrors the flow send control: many
 * block-file tests render the screen bare, so the send affordance must degrade to
 * "cannot open a speech doc" rather than crashing the panel.
 */
function useOptionalDocumentService(): DocumentService | null {
  return useContext(DocumentsContext)?.service ?? null;
}

/** The transient affordance shown after (or instead of) a bulk send. */
type SendStatus =
  | { kind: "idle" }
  | { kind: "sent"; count: number }
  | { kind: "no-active" }
  | { kind: "empty" }
  | { kind: "unavailable" };

function statusMessage(status: SendStatus): string {
  switch (status.kind) {
    case "sent":
      return `Sent ${status.count} section${status.count === 1 ? "" : "s"} to your speech.`;
    case "no-active":
      return "No active speech doc - open or select a speech to send into.";
    case "empty":
      return "Checked sections have no cards to send.";
    case "unavailable":
      return "Could not open the active speech doc.";
    case "idle":
      return "";
  }
}

/** Props for {@link BlockFileTocPanel}. */
export interface BlockFileTocPanelProps {
  /** The block-file editor whose outline the ToC mirrors and whose cards are sent. */
  editor: Editor | null;
  /** The scroll region the ToC tracks to highlight the section in view. */
  scrollContainer?: HTMLElement | null;
}

/**
 * The block-file screen's table of contents, extended with the **ToC bulk-send**
 * pipeline: a checkbox on every heading row and a **Send to Speech Doc** button
 * above the outline that appends every checked section's cards - Auto
 * Speech-formatted - onto the bottom of the
 * {@link useActiveSpeechDoc | active speech doc}.
 *
 * The block file is read-only in this flow (see {@link sendSectionsToSpeechDoc}):
 * gathering and formatting never mutate it, and the append lands in the speech
 * doc's own document.
 *
 * ## No active speech doc / nothing checked: deliberate, reversible no-ops
 *
 * With no active speech doc the send does nothing and shows a subtle inline
 * affordance ("open or select a speech to send into") - the checkboxes stay
 * checked so the debater can pick a target (via the split-screen dock's active-
 * speech picker) and retry, exactly like the flow-sheet send control. The button
 * is disabled entirely until at least one heading is checked, so an empty selection
 * cannot be sent.
 */
export function BlockFileTocPanel({
  editor,
  scrollContainer = null,
}: BlockFileTocPanelProps) {
  const selection = useTocSelection();
  const service = useOptionalDocumentService();
  const { activeId } = useActiveSpeechDoc();
  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });

  const canSend = selection.count > 0 && editor != null;

  const send = useCallback(async () => {
    if (!editor || selection.count === 0) return;
    const positions = [...selection.selectedPositions];
    if (!activeId) {
      setStatus({ kind: "no-active" });
      return;
    }
    if (!service) {
      setStatus({ kind: "unavailable" });
      return;
    }
    let speechHandle;
    try {
      speechHandle = await service.open(activeId);
      await speechHandle.whenLoaded;
    } catch {
      setStatus({ kind: "unavailable" });
      return;
    }
    const result = sendSectionsToSpeechDoc(editor, speechHandle, positions);
    if (result.blockCount === 0) {
      setStatus({ kind: "empty" });
      return;
    }
    selection.clear();
    setStatus({ kind: "sent", count: result.sectionCount });
  }, [editor, selection, activeId, service]);

  const toolbar = (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        data-testid="send-toc-to-speech"
        onClick={() => void send()}
        disabled={!canSend}
        aria-disabled={!canSend}
        title="Append the checked sections' cards to the active speech doc"
        className="rounded border border-shell-border bg-shell-surface px-2 py-1 text-xs font-medium text-shell-text hover:bg-shell-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send to Speech Doc
        {selection.count > 0 ? ` (${selection.count})` : ""}
      </button>
      <span
        data-testid="send-toc-to-speech-status"
        role="status"
        aria-live="polite"
        className="text-xs text-shell-muted"
      >
        {statusMessage(status)}
      </span>
    </div>
  );

  return (
    <TableOfContents
      editor={editor}
      scrollContainer={scrollContainer}
      selection={selection}
      toolbar={toolbar}
    />
  );
}
