import type { Editor } from "@tiptap/core";

import type { OutlineTreeNode } from "../editor/headings";
import { TocRow } from "./TocRow";
import { useActiveHeading } from "./useActiveHeading";
import { useOutlineTree } from "./useOutlineTree";

/** Props for {@link TableOfContents}. */
export interface TableOfContentsProps {
  /**
   * The editor whose heading outline this sidebar mirrors, or `null` while the
   * document is still opening. A nullish editor renders the empty sidebar.
   */
  editor: Editor | null;
  /**
   * The element that scrolls the editor's document, used to track which section
   * is in view and highlight its entry. `null`/omitted disables highlighting
   * (the outline still renders); the block-file screen passes its editor-
   * wrapping scroll region here.
   */
  scrollContainer?: HTMLElement | null;
}

/**
 * Renders a forest of {@link OutlineTreeNode}s as a nested list, each heading a
 * {@link TocRow}. Recurses through `children` so the rendered nesting matches the
 * tree derivation exactly.
 */
function TocNodes({
  nodes,
  activePos,
}: {
  nodes: OutlineTreeNode[];
  activePos: number | null;
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        // `pos` is unique per heading within a snapshot, and the whole tree is
        // re-derived on every document change, so it is a stable-enough key.
        <li key={node.pos}>
          <TocRow node={node} active={node.pos === activePos} />
          {node.children.length > 0 && (
            <div className="border-l border-shell-border pl-3">
              <TocNodes nodes={node.children} activePos={activePos} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The always-visible table-of-contents sidebar for a document editor.
 *
 * It is a live projection of the editor's headings: {@link useOutlineTree}
 * observes the outline and shapes it into the nested tree, and this component
 * renders that tree as rows. Adding, renaming, or removing a heading in the
 * document flows through the observer and re-renders the list with no manual
 * refresh. When a `scrollContainer` is provided it also highlights the entry for
 * the section currently in view, tracking the scroll position live
 * ({@link useActiveHeading}); click-to-scroll navigation is a separate follow-up.
 *
 * The sidebar renders its chrome synchronously (heading + region) even with no
 * editor or no headings, so it is a stable layout region rather than a toggled
 * panel.
 */
export function TableOfContents({
  editor,
  scrollContainer = null,
}: TableOfContentsProps) {
  const tree = useOutlineTree(editor);
  const activePos = useActiveHeading(editor, scrollContainer);

  return (
    <nav
      aria-label="Contents"
      className="flex w-64 flex-none flex-col gap-2 overflow-y-auto rounded-lg border border-shell-border bg-shell-surface p-card"
    >
      <h3 className="text-xs font-semibold uppercase tracking-widest text-shell-muted">
        Contents
      </h3>
      {tree.length === 0 ? (
        <p className="text-sm text-shell-muted">No headings yet</p>
      ) : (
        <TocNodes nodes={tree} activePos={activePos} />
      )}
    </nav>
  );
}
