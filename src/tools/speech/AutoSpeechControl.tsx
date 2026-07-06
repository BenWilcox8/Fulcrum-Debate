import { useState } from "react";
import type { Editor } from "@tiptap/core";

import type { SectionHandle } from "../../preferences";
import type { SpeechTransformOptions } from "../../speech";
import { copySpeechToClipboard, type AutoSpeechToolSettings } from "./auto-speech";

/** Props for {@link AutoSpeechControl}. */
export interface AutoSpeechControlProps {
  /** The live block-file editor, or `null` while it is opening. */
  editor: Editor | null;
  /** Whether a card is addressable at the current selection (the toolbar's gate). */
  enabled: boolean;
  /** The tool's live settings handle - read fresh on each copy so edits apply live. */
  settings: SectionHandle<AutoSpeechToolSettings>;
  /** The toolbar button label. Defaults to "Auto Speech". */
  label?: string;
}

/**
 * The Auto Speech toolbar control: the interactive entry point for the Auto
 * Speech card tool.
 *
 * Clicking the button runs the shared speech engine over the current selection
 * (through the tool's **live** settings, so a Settings change applies to the next
 * copy) and writes the speech to the clipboard as rich text + plain text via
 * {@link copySpeechToClipboard}. Because the clipboard write is async and can
 * fail, the control awaits it and announces the outcome in an `aria-live` status
 * line - the same confirmation affordance the Send-to-Block-File control uses - so
 * the debater knows the copy happened.
 *
 * The control owns no settings of its own; the tool's settings live on the shared
 * preference store and are read through {@link AutoSpeechControlProps.settings}.
 */
export function AutoSpeechControl({
  editor,
  enabled,
  settings,
  label = "Auto Speech",
}: AutoSpeechControlProps) {
  const [status, setStatus] = useState("");

  async function handleCopy() {
    if (!editor) return;
    // Read the live settings snapshot - the section values are the engine options.
    const options = settings.getAll() as SpeechTransformOptions;
    try {
      const result = await copySpeechToClipboard(editor, options);
      setStatus(
        result
          ? "Copied speech to clipboard."
          : "Nothing to copy - the selection has no card content.",
      );
    } catch {
      setStatus("Copy failed; please try again.");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!enabled || !editor}
        aria-disabled={!enabled || !editor}
        onClick={handleCopy}
        className="rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm font-medium text-shell-text hover:bg-shell-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>

      {/* Live confirmation that the copy happened (announced + shown). */}
      <p
        role="status"
        aria-live="polite"
        className="mt-1 min-h-[1rem] text-xs text-shell-muted"
      >
        {status}
      </p>
    </div>
  );
}
