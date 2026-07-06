import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/core";

import {
  type BlockSide,
  BLOCK_SIDES,
  addSection,
  getSideSections,
} from "../../blockfile";
import {
  type SendMode,
  type SendTarget,
  listSendDestinations,
  sendSelectedCard,
} from "./send-to-block-file";

/** Props for {@link SendToBlockFileControl}. */
export interface SendToBlockFileControlProps {
  /** The live block-file editor, or `null` while it is opening. */
  editor: Editor | null;
  /** Whether a card is addressable at the current selection (the toolbar's gate). */
  enabled: boolean;
  /** The action the picker pre-selects (from the tool's settings). Defaults to copy. */
  defaultMode?: SendMode;
  /** The toolbar button label. Defaults to "Send to Block File". */
  label?: string;
}

/** Human-facing side name for the picker groups and confirmation. */
const SIDE_NAME: Record<BlockSide, string> = {
  aff: "Affirmative",
  neg: "Negative",
};

/** The picker's "create a new section in this side" pseudo-destination value. */
function newSectionValue(side: BlockSide): string {
  return `new:${side}`;
}

/** Parse a destination `<select>` value into a side + section index, or a new-section side. */
function parseDestination(
  value: string,
): { kind: "section"; side: BlockSide; index: number } | { kind: "new"; side: BlockSide } | null {
  if (!value) return null;
  if (value.startsWith("new:")) {
    const side = value.slice(4);
    return side === "aff" || side === "neg" ? { kind: "new", side } : null;
  }
  const [side, idx] = value.split(":");
  if ((side === "aff" || side === "neg") && idx !== undefined) {
    return { kind: "section", side, index: Number(idx) };
  }
  return null;
}

/**
 * The Send-to-Block-File toolbar control: the interactive entry point for the
 * Send card tool.
 *
 * Clicking the toolbar button opens a destination picker over the block file's
 * argument sections (grouped by side, with a "new section" option per side),
 * lets the debater choose copy vs move, and sends the selected card there through
 * the pure {@link sendSelectedCard} operation (which composes the block-file
 * document operations, so it persists and is undoable). The chosen destination is
 * confirmed in an `aria-live` status line after the send.
 *
 * The control follows the app's native-control precedent (a `<select>` and
 * radios, styled with the shell/aff-neg design tokens) and the toolbar button
 * styling, so it reads as one of the card tools rather than a bespoke widget.
 */
export function SendToBlockFileControl({
  editor,
  enabled,
  defaultMode = "copy",
  label = "Send to Block File",
}: SendToBlockFileControlProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SendMode>(defaultMode);
  const [value, setValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [confirmation, setConfirmation] = useState("");

  // The live destinations, grouped by side for the picker. Recomputed each open.
  const destinations = useMemo(
    () => (editor && open ? listSendDestinations(editor) : []),
    [editor, open],
  );

  const parsed = parseDestination(value);
  const needsLabel = parsed?.kind === "new";
  const canSend =
    enabled &&
    editor !== null &&
    parsed !== null &&
    (!needsLabel || newLabel.trim().length > 0);

  function openPicker() {
    setMode(defaultMode);
    setValue("");
    setNewLabel("");
    setOpen(true);
  }

  function handleSend() {
    if (!editor || !parsed) return;

    let target: SendTarget;
    if (parsed.kind === "new") {
      const trimmed = newLabel.trim();
      if (!trimmed) return;
      // `addSection` appends the header at the side's end (past the selected
      // card, so the card's position is unchanged) but moves the caret into the
      // new heading. Restore it so the card is still the selection to send.
      const caret = editor.state.selection.from;
      addSection(editor, parsed.side, trimmed, "end");
      editor.commands.setTextSelection(caret);
      target = {
        side: parsed.side,
        index: getSideSections(editor, parsed.side).length - 1,
      };
    } else {
      target = { side: parsed.side, index: parsed.index };
    }

    let result;
    try {
      result = sendSelectedCard(editor, target, mode);
    } catch (err) {
      setConfirmation(
        err instanceof Error ? err.message : "Send failed; please try again.",
      );
      return;
    }
    if (result) {
      setConfirmation(
        `${result.mode === "move" ? "Moved" : "Copied"} card to ` +
          `${SIDE_NAME[result.side]} › ${result.label}.`,
      );
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!enabled || !editor}
        aria-disabled={!enabled || !editor}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm font-medium text-shell-text hover:bg-shell-bg disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>

      {open && (
        <div
          role="group"
          aria-label="Send to block file"
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          className="absolute left-0 top-full z-10 mt-1 flex w-72 flex-col gap-3 rounded-lg border border-shell-border bg-shell-surface p-card shadow-lg"
        >
          <fieldset className="flex items-center gap-4">
            <legend className="sr-only">Action</legend>
            <label className="flex items-center gap-1.5 text-sm text-shell-text">
              <input
                type="radio"
                name="send-mode"
                value="copy"
                checked={mode === "copy"}
                onChange={() => setMode("copy")}
              />
              Copy
            </label>
            <label className="flex items-center gap-1.5 text-sm text-shell-text">
              <input
                type="radio"
                name="send-mode"
                value="move"
                checked={mode === "move"}
                onChange={() => setMode("move")}
              />
              Move
            </label>
          </fieldset>

          <label className="flex flex-col gap-1 text-sm text-shell-text">
            Destination
            <select
              aria-label="Destination"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded border border-shell-border bg-shell-surface px-2 py-1.5 text-sm text-shell-text"
            >
              <option value="">Choose a section…</option>
              {BLOCK_SIDES.map((side) => (
                <optgroup key={side} label={SIDE_NAME[side]}>
                  {destinations
                    .filter((d) => d.side === side)
                    .map((d) => (
                      <option key={`${side}:${d.index}`} value={`${side}:${d.index}`}>
                        {d.label}
                      </option>
                    ))}
                  <option value={newSectionValue(side)}>＋ New section…</option>
                </optgroup>
              ))}
            </select>
          </label>

          {needsLabel && (
            <label className="flex flex-col gap-1 text-sm text-shell-text">
              New section name
              <input
                type="text"
                aria-label="New section name"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. AT: Warming"
                className="rounded border border-shell-border bg-shell-surface px-2 py-1.5 text-sm text-shell-text"
              />
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm text-shell-text hover:bg-shell-bg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSend}
              onClick={handleSend}
              className="rounded border border-aff-strong bg-aff-soft px-3 py-1.5 text-sm font-medium text-aff-strong hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send card
            </button>
          </div>
        </div>
      )}

      {/* Live confirmation of where the card landed (announced + shown). */}
      <p
        role="status"
        aria-live="polite"
        className="mt-1 min-h-[1rem] text-xs text-shell-muted"
      >
        {confirmation}
      </p>
    </div>
  );
}
