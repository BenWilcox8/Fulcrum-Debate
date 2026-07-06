import { useEffect, useReducer } from "react";
import type { Editor } from "@tiptap/core";

import { getSelectedCard } from "../../blockfile";
import type { RegisteredCardTool } from "../registry";

/** Props for {@link CardToolbar}. */
export interface CardToolbarProps {
  /**
   * The live block-file editor, or `null` while it is still opening. When
   * `null`, every tool is disabled (there is nothing to act on).
   */
  editor: Editor | null;
  /** The registered card tools to render, in registration order. */
  tools: RegisteredCardTool[];
}

/**
 * Forces a re-render whenever `editor`'s state changes, so the toolbar's
 * enabled/disabled state tracks the live selection. `useDocumentEditor` returns
 * a raw editor that does not re-render React on transactions (unlike
 * `@tiptap/react`'s `useEditor`), so the toolbar subscribes itself.
 */
function useEditorTick(editor: Editor | null): void {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!editor) return;
    editor.on("transaction", tick);
    return () => {
      editor.off("transaction", tick);
    };
  }, [editor]);
}

/**
 * The card-cutting toolbar: the unified bar at the top of the block-file editor
 * surface that renders every registered card tool as a button.
 *
 * - **Enumerates the registry.** Each tool in `tools` (registration order)
 *   becomes a button labelled with the tool's label. It renders nothing when no
 *   tools are registered, so it never shows an empty bar.
 * - **Applies to the live selection.** Clicking a tool calls its `apply(editor)`
 *   - the registry reads the tool's live persisted settings and runs its
 *   apply-to-selection handler against the editor's current selection.
 * - **Disables when nothing is applicable.** A card-cutting tool needs a card to
 *   act on, so every button is disabled (natively, and `aria-disabled`) whenever
 *   there is no editor or no card is addressable at the current selection
 *   ({@link getSelectedCard}). A tool may narrow that further through its own
 *   {@link RegisteredCardTool.isEnabled} predicate (e.g. Condense requires the
 *   selection to span multiple paragraphs), so enablement is computed per tool.
 *   The state tracks the selection live.
 *
 * The toolbar is presentation only: it owns no tools and no settings. The
 * registry (`src/tools`) owns those, and {@link useCardTools} wires them.
 */
export function CardToolbar({ editor, tools }: CardToolbarProps) {
  useEditorTick(editor);

  if (tools.length === 0) return null;

  // A card-cutting tool needs a card at the selection; without one (or without
  // an editor) there is nothing to cut, so the whole toolbar's baseline is inert.
  const cardSelected = editor !== null && getSelectedCard(editor) !== null;

  return (
    <div
      role="toolbar"
      aria-label="Card tools"
      className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-shell-border bg-shell-surface px-card py-2"
    >
      {tools.map((tool) => {
        // Baseline card gate, narrowed by the tool's own precondition (if any).
        const enabled = cardSelected && tool.isEnabled(editor!);
        return (
        <button
          key={tool.id}
          type="button"
          disabled={!enabled}
          aria-disabled={!enabled}
          onClick={() => {
            if (enabled) tool.apply(editor!);
          }}
          className="rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm font-medium text-shell-text hover:bg-shell-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tool.label}
        </button>
        );
      })}
    </div>
  );
}
