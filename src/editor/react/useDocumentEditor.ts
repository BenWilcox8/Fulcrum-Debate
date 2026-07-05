import { useEffect, useState, type DependencyList } from "react";
import type { Editor } from "@tiptap/core";

import type { DocumentHandle } from "../../documents/core";
import { createEditor } from "../core";
import { editorPreset, type EditorPresetOptions } from "../preset";

/** Options for {@link useDocumentEditor}. */
export interface UseDocumentEditorOptions {
  /**
   * The open document whose `Y.Doc` backs the editor content, or `null`/
   * `undefined` while it is still opening. The hook creates the editor only once
   * a non-closed handle is present and its content has loaded from local
   * IndexedDB, so it is safe to pass a handle straight from `useDocument`.
   */
  handle: DocumentHandle | null | undefined;
  /**
   * The top-level `XmlFragment` name on `handle.doc` this editor binds to (the
   * fragment convention). Distinct names are independent surfaces on the same
   * document.
   */
  fragment: string;
  /**
   * Feature configuration of the shared {@link editorPreset} - extra extensions
   * and/or a narrowed heading range. Omit for the plain shared surface (bold,
   * highlight, font size, headings 1-6).
   */
  preset?: EditorPresetOptions;
}

/**
 * Creates a Tiptap editor bound to a document fragment through the shared
 * {@link editorPreset}, and owns its lifecycle for a React component.
 *
 * Returns `null` until the editor exists: the hook waits for the handle to be
 * present, open, and locally loaded (`handle.whenLoaded`) before creating it, so
 * edits never race the document layer's IndexedDB read. Waiting on that *local*
 * load is the only asynchrony here - nothing awaits the network - so a component
 * using this hook still satisfies the local-first boot rule (it renders its
 * container synchronously; only the editable view appears once local state is
 * ready).
 *
 * Recreation follows the `@tiptap/react` `useEditor(options, deps)` idiom: the
 * editor is rebuilt whenever `handle` or `fragment` changes, or any value in the
 * caller-supplied `deps` changes. Because `preset` is not deep-compared, pass a
 * stable `preset` (module-level or memoised) and list anything that should force
 * a rebuild in `deps`. The editor is always destroyed on cleanup, detaching its
 * ProseMirror plugins from the shared doc.
 */
export function useDocumentEditor(
  { handle, fragment, preset }: UseDocumentEditorOptions,
  deps: DependencyList = [],
): Editor | null {
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    if (!handle || handle.closed) {
      setEditor(null);
      return;
    }

    let active = true;
    let created: Editor | null = null;

    // Wait for the local load before binding: y-indexeddb drops updates until
    // its db is set (which coincides with whenLoaded), so creating the editor
    // earlier could lose the document's own initial content. This awaits local
    // persistence only, never the network.
    void handle.whenLoaded.then(() => {
      if (!active || handle.closed) return;
      created = createEditor({
        binding: { handle, fragment },
        extensions: editorPreset(preset),
      });
      setEditor(created);
    });

    return () => {
      active = false;
      created?.destroy();
      created = null;
      setEditor(null);
    };
    // `preset` is intentionally not a dependency - callers force rebuilds via
    // `deps` (the documented useEditor idiom). handle/fragment always rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, fragment, ...deps]);

  return editor;
}
