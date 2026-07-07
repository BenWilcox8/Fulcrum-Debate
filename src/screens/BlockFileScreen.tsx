import { useState } from "react";
import { EditorContent } from "@tiptap/react";

import { useDocumentEditor } from "../editor/react";
import type { EditorPresetOptions } from "../editor/preset";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  cardCreate,
  insertCard,
} from "../blockfile";
import { useBlockFile } from "../blockfile-workspace";
import { BlockFileTocPanel } from "./BlockFileTocPanel";
import { CardFormattingStyles } from "../formatting/react";
import { CardToolbar, HighlightStyles, useCardTools } from "../tools/react";
import { CardSpeechDrag } from "../speech-doc/card-drag";
import { SpeechDockLayout } from "../speech-doc";
import { buildBlockFileExportPayload } from "../export";
import { ExportButton } from "../export/react";

/**
 * The block-file schema plus the card node model and its quick-create keyboard
 * binding, layered onto the shared preset's feature-extension seam.
 *
 * A module-level constant so its reference is stable across renders, per the
 * {@link useDocumentEditor} stable-preset contract - otherwise the editor would
 * be told its config changed on every render.
 */
const BLOCK_FILE_PRESET: EditorPresetOptions = {
  extensions: [...blockFileExtensions, ...cardExtensions, cardCreate, CardSpeechDrag],
};

/**
 * A human-readable label for the quick-create chord, resolving `Mod` to the
 * platform's modifier (Cmd on macOS, Ctrl elsewhere) for the button tooltip.
 */
const CARD_CREATE_SHORTCUT_HINT = (() => {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iP(hone|[ao]d)/.test(navigator.platform);
  return isMac ? "⇧⌘C" : "Ctrl+Shift+C";
})();

/**
 * The Block File screen: one continuous, scrollable editing surface over the
 * workspace's single block-file document.
 *
 * The document is a workspace singleton ({@link useBlockFile}), opened through
 * the shared document service so edits persist locally and restore on reopen. We
 * bind the shared React editor primitive ({@link DocumentEditor}) to the block
 * file's one {@link BLOCK_FILE_FRAGMENT} body fragment with the block-file schema
 * installed, so the enforced Affirmative-then-Negative structure is edited in
 * place as a single document (one selection, one scroll).
 *
 * The screen paints synchronously and only fills in the editor once the handle's
 * local IndexedDB load resolves (the primitive gates on that), so nothing here
 * awaits the network - the local-first boot rule holds. Because the singleton is
 * created on first use, there is no "not found" state; a brief loading line
 * covers the moment before the document is resolved and its content read.
 */
export default function BlockFileScreen() {
  const { handle, loaded, resolving, error, retry } = useBlockFile();
  const ready = !resolving && loaded;

  // The screen owns the editor (rather than delegating to `DocumentEditor`) so
  // the persistent ToC sidebar can observe the same live editor's outline - the
  // toolbar-style pattern `useDocumentEditor` is documented for. The editor is
  // `null` until the handle is present and locally loaded.
  const editor = useDocumentEditor(
    { handle, fragment: BLOCK_FILE_FRAGMENT, preset: BLOCK_FILE_PRESET },
    [handle],
  );

  // The scroll region wrapping the editor - captured via a callback ref (as
  // state, so the ToC re-renders once the element mounts) and handed to the
  // sidebar so it can track the scroll position and highlight the live section.
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(
    null,
  );

  // The registered card-cutting tools the toolbar renders. Provider-tolerant,
  // so a bare subtree still paints the toolbar.
  const tools = useCardTools();

  return (
    <section
      aria-labelledby="screen-heading"
      className="flex flex-1 min-h-0 flex-col gap-4"
    >
      {/* Live evidence-formatting stylesheet: renders card regions and
          highlighted runs to the active formatting profile, updating in place
          when the profile is edited (no reload). Scoped to `.block-file-editor`
          below. */}
      <CardFormattingStyles />

      {/* Live highlighter-color stylesheet: paints highlighted (read-aloud)
          runs in the Highlight tool's configured color, updating in place when
          the color is changed in Settings. Scoped to `.block-file-editor`. */}
      <HighlightStyles />

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2
            id="screen-heading"
            className="text-2xl font-semibold tracking-tight text-shell-text"
          >
            Block File
          </h2>
          <p className="max-w-prose text-sm text-shell-muted">
            Cut cards and organize prepared blocks. Affirmative evidence sits
            above the negative, in one continuous document.
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <ExportButton
            disabled={!ready || !handle}
            buildPayload={() =>
              handle ? buildBlockFileExportPayload(handle, "Block File") : null
            }
          />

          <button
            type="button"
            onClick={() => editor && insertCard(editor)}
            disabled={!editor}
            title={`New card (${CARD_CREATE_SHORTCUT_HINT})`}
            className="shrink-0 rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm font-medium text-shell-text hover:bg-shell-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            New card
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <BlockFileTocPanel editor={editor} scrollContainer={scrollContainer} />

        {/* The editor column docks the Speech Doc editor alongside it, so a
            debater can drag a card straight from the block file into the speech
            (the single-card drag-into-Speech-Doc pipeline). The card-cutting
            toolbar sits at the top of the editing surface (right of the ToC,
            above the scroll region) so it never crowds the sidebar or the
            document. */}
        <SpeechDockLayout className="overflow-hidden rounded-lg border border-shell-border">
          <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 bg-shell-surface p-2">
            <CardToolbar editor={editor} tools={tools} />

            <div
              ref={setScrollContainer}
              className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-shell-border bg-shell-surface p-card"
            >
              {error ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-shell-muted">
                    Could not open block file. {error.message}
                  </p>
                  <button
                    onClick={retry}
                    className="self-start rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm text-shell-text hover:bg-shell-bg"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {!ready && (
                    <p className="text-sm text-shell-muted">Opening block file…</p>
                  )}
                  <EditorContent editor={editor} className="block-file-editor" />
                </>
              )}
            </div>
          </div>
        </SpeechDockLayout>
      </div>
    </section>
  );
}
