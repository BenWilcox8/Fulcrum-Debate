/**
 * The heading outline query - the table-of-contents seam.
 *
 * A ToC panel needs three things per heading: how deeply it nests, what it
 * says, and where to scroll when the reader clicks it. {@link getOutline} walks
 * an editor's current document and returns exactly that, in document order. It
 * is a pure derivation of editor state - no ProseMirror plugin, no cached
 * outline data structure - so there is nothing to keep in sync and nothing to
 * invalidate. {@link observeOutline} is the thin live wrapper: it re-derives on
 * every document change, which is the shape a ToC panel actually consumes.
 *
 * ## Position semantics
 *
 * Each {@link OutlineHeading} carries the ProseMirror `pos` of its heading node
 * in the *current* document. A ProseMirror position is only meaningful against
 * the document version it was read from - editing text before a heading shifts
 * every later position - so an outline is a **snapshot valid for the document
 * as it stands when {@link getOutline} ran**. That is not a limitation for a
 * ToC: the panel re-derives the whole outline on each change (that is what
 * {@link observeOutline} does), so the positions it holds always match the
 * document it is displaying. To act on one, drive the same editor, e.g.
 * `editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()`
 * (`pos` is the position just before the heading node; `pos + 1` lands inside
 * it).
 */
import type { Editor, EditorEvents } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { HeadingLevel } from "./heading-extension";

/** The node-type name ProseMirror gives the heading node (Tiptap's default). */
const HEADING_NODE = "heading";

/** One heading in the document outline. */
export interface OutlineHeading {
  /** The heading's nesting level, 1-6 (see {@link HeadingLevel}). */
  level: HeadingLevel;
  /** The heading's plain text content, with any inline marks flattened away. */
  text: string;
  /**
   * The ProseMirror position of the heading node in the document it was read
   * from - the position immediately before the node. Valid only against that
   * document version; re-derive after edits (see the module notes). Use
   * `pos + 1` to address a selection inside the heading.
   */
  pos: number;
}

/**
 * Walks a ProseMirror document node and collects its headings in document
 * order. Shared by {@link getOutline} and any caller that already holds a
 * ProseMirror doc node (e.g. one parsed from persisted JSON via the schema).
 */
export function outlineFromDoc(doc: ProseMirrorNode): OutlineHeading[] {
  const headings: OutlineHeading[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== HEADING_NODE) {
      // Headings are top-level blocks and never nest inside another node's
      // content, so there is no subtree worth descending into for them; but
      // returning true keeps the walk going for every other container.
      return true;
    }

    // `level` is a required, schema-constrained attribute (1-6), so it is
    // always one of HeadingLevel; `textContent` flattens inline marks to plain
    // text, which is exactly what a ToC label wants.
    headings.push({
      level: node.attrs.level as HeadingLevel,
      text: node.textContent,
      pos,
    });

    return false;
  });

  return headings;
}

/**
 * Returns the editor's heading outline in document order: for each heading its
 * {@link OutlineHeading.level | level}, {@link OutlineHeading.text | text}, and
 * {@link OutlineHeading.pos | position}.
 *
 * Pure over the editor's current state - calling it twice without an edit
 * returns equal outlines. See the module notes for position semantics and how a
 * ToC panel turns a `pos` into a scroll target.
 */
export function getOutline(editor: Editor): OutlineHeading[] {
  return outlineFromDoc(editor.state.doc);
}

/**
 * Subscribes to an editor's heading outline and invokes `listener` with a fresh
 * outline immediately and again after every document change. Returns an
 * unsubscribe function.
 *
 * This is the API a ToC panel consumes: it never has to know *when* to
 * recompute, and because {@link getOutline} is a pure snapshot the listener
 * always receives an outline consistent with the current document. Transactions
 * that do not change the document (selection-only, focus) are ignored, so a ToC
 * does not re-render on cursor moves.
 */
export function observeOutline(
  editor: Editor,
  listener: (outline: OutlineHeading[]) => void,
): () => void {
  listener(getOutline(editor));

  const handler = ({ transaction }: EditorEvents["update"]) => {
    // Only recompute when the document actually changed - selection-only
    // updates leave the outline identical.
    if (transaction.docChanged) {
      listener(getOutline(editor));
    }
  };

  editor.on("update", handler);
  return () => {
    editor.off("update", handler);
  };
}
