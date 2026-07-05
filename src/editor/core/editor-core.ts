/**
 * The shared rich-text editor core for Fulcrum Debate.
 *
 * Every text surface a debater touches - a block file, a card editor, a speech
 * doc - is a {@link https://tiptap.dev | Tiptap} editor bound to one named
 * fragment of a document-core `Y.Doc`. This module is that single foundation:
 * a factory that builds a headless Tiptap editor whose edits flow straight into
 * the Yjs document, so the existing local document layer persists them.
 *
 * This is the base layer only. Marks (bold / highlight / font-size), headings,
 * the concrete extension preset, and the React editor component are deliberate
 * follow-up tasks and live elsewhere. What is fixed here is the plumbing every
 * one of those builds on: the baseline schema and the Yjs binding.
 *
 * ## Why Tiptap v3 + `@tiptap/y-tiptap`
 *
 * Tiptap v3 is the current stable line. Its collaboration binding
 * ({@link https://www.npmjs.com/package/@tiptap/extension-collaboration
 * `@tiptap/extension-collaboration`}) wraps `@tiptap/y-tiptap`, Tiptap's own
 * maintained fork of `y-prosemirror`. Using the first-party extension rather
 * than wiring `y-prosemirror` by hand keeps the ProseMirror plugin lifecycle
 * (sync, mapping, undo) owned by Tiptap and version-matched to `@tiptap/pm`.
 *
 * ## Yjs owns undo - no history extension
 *
 * The baseline set deliberately omits Tiptap's `History` / StarterKit undo. The
 * Collaboration extension already installs the Yjs undo plugin, so undo/redo
 * flow through the shared Yjs history; adding ProseMirror's own history would
 * create a second, conflicting stack. Wiring undo UI/keymaps onto the Yjs
 * history is a later undo task; this module only guarantees the single stack.
 *
 * ## Local-first, never network
 *
 * The binding is purely the local `Y.Doc`. There is no collaboration provider,
 * cursor, or awareness layer here - real-time sync between peers is a later Sync
 * PRD. Creating an editor awaits nothing; edits land in the doc synchronously
 * and the document layer persists them to IndexedDB.
 *
 * ## Headless
 *
 * The editor is created without any React component or UI. Under a DOM
 * environment (the Tauri webview, or jsdom in tests) it mounts to a detached
 * element that is never attached to the page, which is enough for the full
 * editor API to work. Callers that own a real mount point (the future React
 * editor component) pass one via {@link CreateEditorOptions.element}.
 */
import { Editor, type Extensions } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Collaboration from "@tiptap/extension-collaboration";

import type { DocumentHandle } from "../../documents/core";

/**
 * A Yjs binding target: which document, and which named fragment within it.
 *
 * The fragment name follows the AGENTS.md fragment convention - a top-level
 * shared-type name on the document's `Y.Doc`, the unit of ownership a feature
 * PRD reserves. The editor binds to `handle.doc.getXmlFragment(fragment)`, so
 * once a document's rich text ships under a given name that name is an
 * `XmlFragment` for the life of the document and must not be re-typed or
 * renamed.
 */
export interface EditorBinding {
  /** The open document whose `Y.Doc` backs this editor's content. */
  handle: DocumentHandle;
  /**
   * The top-level `XmlFragment` name on `handle.doc` that holds this editor's
   * content. Must be non-empty. Distinct names on the same document are
   * independent text surfaces; the same name on the same document is the same
   * surface (two editors on it converge).
   */
  fragment: string;
}

/** Options for {@link createEditor}. */
export interface CreateEditorOptions {
  /** The Yjs document + fragment this editor reads and writes. */
  binding: EditorBinding;
  /**
   * Extensions layered on top of the always-present baseline (document,
   * paragraph, text, collaboration). Follow-up tasks pass marks, headings, and
   * the shared preset here. Defaults to none.
   *
   * Do not pass a `History`/undo extension - the baseline collaboration binding
   * already owns undo through Yjs (see the module notes).
   */
  extensions?: Extensions;
  /**
   * A real DOM mount point. Omit for a headless editor (the default): under a
   * DOM environment the editor mounts to a detached element and the full API
   * works without ever touching the page. The future React editor component
   * supplies its own element here.
   */
  element?: Element;
}

/**
 * Creates a headless Tiptap editor bound to a named fragment of a document-core
 * `Y.Doc`.
 *
 * The returned {@link Editor} always carries the baseline schema (document /
 * paragraph / text) plus the Yjs collaboration binding, with any caller
 * {@link CreateEditorOptions.extensions | extensions} layered on top. Edits made
 * through the editor's API mutate the bound `XmlFragment`, so the existing
 * document layer persists and reloads them; two editors created on the same
 * document and fragment name observe each other's edits and converge.
 *
 * Nothing here awaits the network. Remember to {@link Editor.destroy} the editor
 * when done to detach its ProseMirror plugins from the doc.
 */
export function createEditor(options: CreateEditorOptions): Editor {
  const { binding, extensions = [], element } = options;
  const { handle, fragment } = binding;

  if (fragment.length === 0) {
    throw new Error("createEditor: fragment must be a non-empty string");
  }

  // Bind to the named top-level XmlFragment. Yjs fixes this name's type on first
  // access, which is exactly the fragment-ownership guarantee the document model
  // contract relies on.
  const xmlFragment = handle.doc.getXmlFragment(fragment);

  return new Editor({
    // Omitting `element` would leave the editor unmounted (no view, no usable
    // API); a headless editor still needs a detached element to mount to. Under
    // jsdom / the Tauri webview `document` is always present.
    element: element ?? document.createElement("div"),
    // The collaboration binding, not the `content` option, seeds the editor from
    // the fragment. Injecting CSS is a UI concern the React component owns.
    injectCSS: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      // Yjs owns the document state and the undo stack; no History extension.
      Collaboration.configure({ fragment: xmlFragment }),
      ...extensions,
    ],
  });
}
