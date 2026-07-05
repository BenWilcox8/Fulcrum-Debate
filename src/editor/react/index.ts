/**
 * React integration for the shared editor: the reusable editable surface every
 * feature editor builds on.
 *
 * - {@link DocumentEditor} is the component - a Tiptap editor bound to a document
 *   fragment through the shared {@link editorPreset}, rendered via
 *   `@tiptap/react`. No toolbar or feature chrome; feature editors compose those
 *   around it.
 * - {@link useDocumentEditor} is the underlying hook for callers that need the
 *   raw {@link Editor} (e.g. to wire a toolbar) rather than just the surface.
 *
 * Both take a document-core `DocumentHandle` + fragment name, create the editor
 * with the preset (plus optional feature extensions), and destroy it on cleanup.
 * They wait only on the handle's local load, never the network.
 */
export {
  DocumentEditor,
  type DocumentEditorProps,
} from "./DocumentEditor";
export {
  useDocumentEditor,
  type UseDocumentEditorOptions,
} from "./useDocumentEditor";
