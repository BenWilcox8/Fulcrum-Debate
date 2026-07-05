import { type DependencyList } from "react";
import { EditorContent } from "@tiptap/react";

import {
  useDocumentEditor,
  type UseDocumentEditorOptions,
} from "./useDocumentEditor";

/** Props for {@link DocumentEditor}. */
export interface DocumentEditorProps extends UseDocumentEditorOptions {
  /**
   * Caller-supplied rebuild dependencies, forwarded to {@link useDocumentEditor}
   * (the `@tiptap/react` `useEditor(options, deps)` idiom). The editor is
   * rebuilt when `handle`, `fragment`, or any of these change.
   */
  deps?: DependencyList;
  /** Class applied to the editor's container element. */
  className?: string;
}

/**
 * The reusable editable surface: a Tiptap editor bound to a document fragment
 * through the shared {@link editorPreset}, rendered with `@tiptap/react`'s
 * {@link EditorContent}.
 *
 * This is the primitive feature editors (block file, card editor, speech doc)
 * build on - it deliberately ships no toolbar, menus, keymaps, or feature
 * chrome; a feature composes those around it and passes its own extensions
 * through `preset.extensions`.
 *
 * The container div renders synchronously; the ProseMirror view mounts into it
 * once the handle is present and locally loaded (see {@link useDocumentEditor}),
 * so the component never gates rendering on anything beyond the document layer's
 * local load. The editor is destroyed on unmount.
 */
export function DocumentEditor({
  handle,
  fragment,
  preset,
  deps,
  className,
}: DocumentEditorProps) {
  const editor = useDocumentEditor({ handle, fragment, preset }, deps);
  return <EditorContent editor={editor} className={className} />;
}
