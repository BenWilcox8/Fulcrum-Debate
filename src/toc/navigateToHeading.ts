import type { Editor } from "@tiptap/core";

/** The node-type name ProseMirror gives the heading node (Tiptap's default). */
const HEADING_NODE = "heading";

/**
 * Selects and scrolls the editor to the heading at `pos`, the ProseMirror
 * position an {@link OutlineHeading} carries (the position immediately before
 * the heading node). This is the click-to-scroll gesture a table-of-contents
 * row drives, applied exactly as the outline query documents:
 * `editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()`.
 *
 * ## Stale positions
 *
 * A ToC holds `pos` values that are snapshots of one document version. The panel
 * re-derives them on every change, so in practice a row's `pos` matches the
 * displayed document - but the document *could* have moved on between the last
 * derivation and the click. Rather than trust the snapshot, this guard verifies
 * that `pos` still addresses a heading in the *current* document before acting:
 * an out-of-range or no-longer-a-heading position is left untouched (returns
 * `false`), so a stale click is a safe no-op rather than a throw or a jump to
 * the wrong node. Returns `true` when the navigation was applied.
 */
export function navigateToHeading(editor: Editor, pos: number): boolean {
  const { doc } = editor.state;

  // Guard the snapshot against a document that has changed since the outline was
  // derived: `nodeAt` is null for an out-of-range position, and the node there
  // may no longer be a heading.
  if (pos < 0 || pos >= doc.content.size) return false;
  const node = doc.nodeAt(pos);
  if (!node || node.type.name !== HEADING_NODE) return false;

  // `pos` is just before the heading node; `pos + 1` lands a selection inside it
  // (see the outline query's position semantics).
  return editor
    .chain()
    .focus()
    .setTextSelection(pos + 1)
    .scrollIntoView()
    .run();
}
