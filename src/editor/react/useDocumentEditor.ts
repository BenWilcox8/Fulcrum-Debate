import { useEffect, useRef, useState, type DependencyList } from "react";
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
 * **stable** `preset` reference and list anything that should force a rebuild in
 * `deps`. The editor is always destroyed on cleanup, detaching its ProseMirror
 * plugins from the shared doc.
 *
 * **Stable preset - patterns:**
 *
 * WRONG - new object every render, editor never rebuilds to pick up changes:
 * ```tsx
 * // Inside a render function / component body:
 * useDocumentEditor({ handle, fragment, preset: { extensions: [Foo] } });
 * ```
 *
 * RIGHT - module-level constant (simplest):
 * ```ts
 * const MY_PRESET: EditorPresetOptions = { extensions: [Foo] };
 * // ...inside component:
 * useDocumentEditor({ handle, fragment, preset: MY_PRESET });
 * ```
 *
 * RIGHT - memoised when the config depends on props/state:
 * ```tsx
 * const preset = useMemo(() => ({ extensions: [Foo], headingLevels: [1, 2] }), []);
 * useDocumentEditor({ handle, fragment, preset });
 * ```
 *
 * RIGHT - force a rebuild by listing the changing input in deps:
 * ```tsx
 * useDocumentEditor({ handle, fragment, preset: { headingLevels: levels } }, [levels]);
 * ```
 */
export function useDocumentEditor(
  { handle, fragment, preset }: UseDocumentEditorOptions,
  deps: DependencyList = [],
): Editor | null {
  const [editor, setEditor] = useState<Editor | null>(null);

  const prevPresetRef = useRef<EditorPresetOptions | undefined>(undefined);
  const prevDepsRef = useRef<DependencyList | undefined>(undefined);

  useEffect(() => {
    if (import.meta.env.DEV && prevDepsRef.current !== undefined) {
      const presetChanged = !Object.is(preset, prevPresetRef.current);
      const depsChanged =
        deps.length !== prevDepsRef.current.length ||
        deps.some((d, i) => !Object.is(d, prevDepsRef.current![i]));
      if (presetChanged && !depsChanged) {
        console.warn(
          "[useDocumentEditor] The `preset` reference changed between renders " +
            "without a corresponding change in `deps`. The editor will NOT be " +
            "recreated - the active editor keeps its original preset (stale). " +
            "Pass a stable/memoised preset object, or list the changing input " +
            "in the `deps` array to force a rebuild. See the JSDoc for examples.",
        );
      }
    }
    prevPresetRef.current = preset;
    prevDepsRef.current = deps;
  });

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
