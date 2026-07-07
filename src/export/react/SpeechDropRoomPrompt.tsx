import { useEffect, useRef, useState } from "react";

/** Props for {@link SpeechDropRoomPrompt}. */
export interface SpeechDropRoomPromptProps {
  /** Whether the prompt is shown. */
  open: boolean;
  /** Seeds the input with the last-used room code (or empty). */
  initialCode: string;
  /** Called with the entered room code when the debater confirms. */
  onSubmit: (code: string) => void;
  /** Called when the debater cancels (Escape, backdrop, or Cancel). */
  onCancel: () => void;
}

/**
 * The room-code prompt shown when a debater exports to SpeechDrop.
 *
 * A small, self-contained modal (no dialog library) styled with the app's shell
 * tokens: a labelled text input seeded with the last-used code, confirm/cancel
 * actions, Escape-to-cancel, and autofocus so the debater can type the code and
 * press Enter. It is purely presentational - the {@link useSpeechDropTarget} hook
 * owns the open state and turns confirm/cancel into the promise the export
 * awaits.
 */
export function SpeechDropRoomPrompt({
  open,
  initialCode,
  onSubmit,
  onCancel,
}: SpeechDropRoomPromptProps) {
  const [code, setCode] = useState(initialCode);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-seed and focus each time the prompt opens.
  useEffect(() => {
    if (open) {
      setCode(initialCode);
      // Focus after paint so the input exists.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open, initialCode]);

  if (!open) return null;

  const submit = () => onSubmit(code);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="speechdrop-prompt-title"
        className="w-full max-w-sm rounded-lg border border-shell-border bg-shell-surface p-card shadow-lg"
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        <h2
          id="speechdrop-prompt-title"
          className="text-lg font-semibold text-shell-text"
        >
          Upload to SpeechDrop
        </h2>
        <p className="mt-1 text-sm text-shell-muted">
          Enter the room code for your round to drop this document in.
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-shell-text">
            Room code
            <input
              ref={inputRef}
              type="text"
              value={code}
              maxLength={12}
              autoComplete="off"
              spellCheck={false}
              aria-label="SpeechDrop room code"
              onChange={(e) => setCode(e.target.value)}
              className="rounded border border-shell-border bg-shell-surface px-3 py-2 text-base tracking-wide text-shell-text focus:border-aff-strong focus:outline-none"
            />
          </label>
          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm font-medium text-shell-text hover:bg-shell-bg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={code.trim() === ""}
              className="rounded border border-aff-strong bg-aff-strong px-3 py-1.5 text-sm font-medium text-white hover:bg-aff disabled:cursor-not-allowed disabled:opacity-50"
            >
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
