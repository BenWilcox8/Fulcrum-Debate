import type { ReactNode } from "react";
import type { Editor } from "@tiptap/core";

import type { OutlineTreeNode } from "../editor/headings";
import { navigateToHeading } from "./navigateToHeading";
import { TocRow } from "./TocRow";
import type { TocSelection } from "./useTocSelection";
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
  /**
   * When provided, each heading row grows an "include this section" checkbox
   * (rendered in {@link TocRow}'s leading-control slot) bound to this selection
   * controller - the seam the block-file speech pipeline sends from. Omit for a
   * plain, read-only outline (the default), keeping this component reusable for
   * any editor with headings.
   */
  selection?: TocSelection;
  /**
   * Optional content rendered above the heading list (below the "Contents"
   * title) - the slot a feature fills with a toolbar such as the block-file
   * "Send to Speech Doc" button. Omitted by default.
   */
  toolbar?: ReactNode;
}

/**
 * Renders a forest of {@link OutlineTreeNode}s as a nested list, each heading a
 * {@link TocRow}. Recurses through `children` so the rendered nesting matches the
 * tree derivation exactly.
 *
 * `editor` is threaded through so each row can scroll the editor to its heading
 * on activation; a nullish editor renders inert rows (no navigation target).
 */
function TocNodes({
  nodes,
  activePos,
  editor,
  selection,
}: {
  nodes: OutlineTreeNode[];
  activePos: number | null;
  editor: Editor | null;
  selection?: TocSelection;
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        // `pos` is unique per heading within a snapshot, and the whole tree is
        // re-derived on every document change, so it is a stable-enough key.
        <li key={node.pos}>
          <TocRow
            node={node}
            active={node.pos === activePos}
            onActivate={
              editor ? () => navigateToHeading(editor, node.pos) : undefined
            }
            leadingControl={
              selection ? (
                <input
                  type="checkbox"
                  checked={selection.isSelected(node.pos)}
                  onChange={() => selection.toggle(node.pos)}
                  aria-label={`Include ${node.text} in speech`}
                  className="h-4 w-4 cursor-pointer accent-aff-strong"
                />
              ) : undefined
            }
          />
          {node.children.length > 0 && (
            <div className="border-l border-shell-border pl-3">
              <TocNodes
                nodes={node.children}
                activePos={activePos}
                editor={editor}
                selection={selection}
              />
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
 * ({@link useActiveHeading}). Clicking a row scrolls the editor to that heading
 * (via {@link navigateToHeading}).
 *
 * The sidebar renders its chrome synchronously (heading + region) even with no
 * editor or no headings, so it is a stable layout region rather than a toggled
 * panel.
 */
export function TableOfContents({
  editor,
  scrollContainer = null,
  selection,
  toolbar,
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
      {toolbar}
      {tree.length === 0 ? (
        <p className="text-sm text-shell-muted">No headings yet</p>
      ) : (
        <TocNodes
          nodes={tree}
          activePos={activePos}
          editor={editor}
          selection={selection}
        />
      )}
    </nav>
  );
}
