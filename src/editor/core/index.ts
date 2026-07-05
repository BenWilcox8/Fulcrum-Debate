/**
 * Public surface of the shared editor core.
 *
 * The editor core is the single Tiptap foundation every text surface builds on:
 * a factory that binds a headless editor to a named fragment of a document-core
 * `Y.Doc`. See {@link ./editor-core} for the full design notes. Marks, headings,
 * the extension preset, and the React editor component are separate tasks.
 */
export {
  createEditor,
  type CreateEditorOptions,
  type EditorBinding,
} from "./editor-core";
export type { Editor, Extensions } from "@tiptap/core";
