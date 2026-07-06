import { EditorContent } from "@tiptap/react";

import { useDocumentEditor } from "../editor/react";
import type { EditorPresetOptions } from "../editor/preset";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "../blockfile";
import { useBlockFile } from "../blockfile-workspace";
import { TableOfContents } from "../toc";

/**
 * The block-file schema layered onto the shared preset's feature-extension seam.
 *
 * A module-level constant so its reference is stable across renders, per the
 * {@link useDocumentEditor} stable-preset contract - otherwise the editor would
 * be told its config changed on every render.
 */
const BLOCK_FILE_PRESET: EditorPresetOptions = { extensions: blockFileExtensions };

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

  return (
    <section
      aria-labelledby="screen-heading"
      className="flex flex-1 min-h-0 flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="screen-heading"
          className="text-2xl font-semibold tracking-tight text-shell-text"
        >
          Block File
        </h2>
        <p className="max-w-prose text-sm text-shell-muted">
          Cut cards and organize prepared blocks. Affirmative evidence sits above
          the negative, in one continuous document.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <TableOfContents editor={editor} />

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-shell-border bg-shell-surface p-card">
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
    </section>
  );
}
