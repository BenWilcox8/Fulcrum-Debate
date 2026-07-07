import { useCallback, useContext, useEffect, useState } from "react";

import { DocumentsContext } from "../../documents/react/DocumentsContext";
import type { DocumentService } from "../../documents/service";
import { useActiveSpeechDoc } from "../../speech-doc";
import { appendFlowNodesToSpeechDoc } from "../send-to-speech";
import { useFlowSheet } from "./flow-sheet-context";

/**
 * Reads the app's {@link DocumentService} *tolerantly* - returns `null` outside a
 * `DocumentsProvider` instead of throwing like `useDocumentService`. This mirrors
 * the dashboard's provider-optional reader: the flow panel is rendered bare (with
 * just a handle, no `DocumentsProvider`) in many canvas tests, so the send control
 * must degrade to "cannot open a speech doc" rather than crashing the panel.
 */
function useOptionalDocumentService(): DocumentService | null {
  return useContext(DocumentsContext)?.service ?? null;
}

/** Whether the platform uses the Command key (so the shortcut reads ⌘⏎ vs Ctrl+↵). */
function usesMetaKey(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

/** The transient affordance shown after (or instead of) a send. */
type SendStatus =
  | { kind: "idle" }
  | { kind: "sent"; count: number }
  | { kind: "no-active" }
  | { kind: "empty" }
  | { kind: "unavailable" };

function statusMessage(status: SendStatus): string {
  switch (status.kind) {
    case "sent":
      return `Sent ${status.count} argument${status.count === 1 ? "" : "s"} to your speech.`;
    case "no-active":
      return "No active speech doc - open or select a speech to send into.";
    case "empty":
      return "Selected arguments have no text to send.";
    case "unavailable":
      return "Could not open the active speech doc.";
    case "idle":
      return "";
  }
}

/**
 * The **Send Flow -> Speech Doc** affordance in the flow panel's toolbar strip: a
 * button (enabled once the debater has Shift+Click-selected one or more arguments)
 * plus the global **Ctrl/Cmd+Enter** hotkey, both of which append the selected
 * containers' content onto the {@link useActiveSpeechDoc | active speech doc}.
 *
 * The two entry points mirror the collapse feature (button + hotkey). The hotkey
 * is document-wide because the debater's caret is inside a flow box when they
 * reach for it; it deliberately uses **Ctrl/Cmd+Enter**, never plain Enter /
 * Shift+Enter, so it never collides with the argument-row transitions or shorthand
 * expansion those keys drive.
 *
 * ## No active speech doc: a deliberate, reversible no-op
 *
 * When no speech doc is active, sending does nothing to any document and surfaces
 * a subtle inline affordance ("open or select a speech to send into") via the
 * `aria-live` status line - the selection is preserved so the debater can pick a
 * target and retry. Auto-creating a speech doc from a keyboard chord was rejected:
 * it would spawn stray documents and silently choose a target the debater did not,
 * which the non-destructive spirit of this pipeline argues against. The
 * split-screen dock already offers an explicit active-speech picker.
 */
export function SendToSpeechControl() {
  const context = useFlowSheet();
  const flowHandle = context?.handle ?? null;
  const selection = context?.selection ?? null;
  const service = useOptionalDocumentService();
  const { activeId } = useActiveSpeechDoc();

  const [status, setStatus] = useState<SendStatus>({ kind: "idle" });

  const selectedCount = selection?.count ?? 0;
  const canSend = selectedCount > 0;

  const send = useCallback(async () => {
    if (!selection || selection.count === 0) return;
    const ids = [...selection.selectedNodeIds];
    if (!activeId) {
      setStatus({ kind: "no-active" });
      return;
    }
    if (!service || !flowHandle || flowHandle.closed) {
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
    const result = appendFlowNodesToSpeechDoc(flowHandle, speechHandle, ids);
    if (result.paragraphCount === 0) {
      setStatus({ kind: "empty" });
      return;
    }
    selection.clear();
    setStatus({ kind: "sent", count: result.nodeCount });
  }, [selection, activeId, service, flowHandle]);

  // The global Ctrl/Cmd+Enter chord. Only acts on a non-empty selection, so an
  // idle Cmd+Enter elsewhere passes straight through; when it does act it
  // preventDefault()s so no editor also treats it as an insert-newline.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
      if (!event.ctrlKey && !event.metaKey) return;
      if (!canSend) return;
      event.preventDefault();
      void send();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canSend, send]);

  const shortcutLabel = usesMetaKey() ? "⌘⏎" : "Ctrl+Enter";
  const message = statusMessage(status);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        data-testid="send-to-speech"
        onClick={() => void send()}
        disabled={!canSend}
        aria-disabled={!canSend}
        title={`Append the selected arguments to the active speech doc (${shortcutLabel})`}
        className="rounded border border-shell-border bg-shell-surface px-2 py-1 text-xs font-medium text-shell-text hover:bg-shell-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        Send to speech
        {selectedCount > 0 ? ` (${selectedCount})` : ""}
      </button>
      <span
        data-testid="send-to-speech-status"
        role="status"
        aria-live="polite"
        className="text-xs text-shell-muted"
      >
        {message}
      </span>
    </div>
  );
}
