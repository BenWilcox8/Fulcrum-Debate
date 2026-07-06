import type { ReactNode } from "react";

import type { OutlineTreeNode } from "../editor/headings";

/** Props for {@link TocRow}. */
export interface TocRowProps {
  /** The outline heading this row renders (its own label, not its children). */
  node: OutlineTreeNode;
  /**
   * Optional control rendered *before* the label - the reserved slot a later
   * feature fills with a per-heading control (the speech-doc pipeline adds an
   * "include this section" checkbox here). It is unused today; the point of the
   * slot is that adding that control later never touches this component's
   * structure. When omitted, no leading element is rendered at all.
   */
  leadingControl?: ReactNode;
}

/**
 * One row of the table of contents: a single heading's plain-text label, with an
 * explicit leading-control slot ahead of it.
 *
 * The row is deliberately *not* recursive - it renders exactly its own heading.
 * The nesting of children is the tree renderer's job ({@link TableOfContents}),
 * so this component stays a flat, presentational unit that a future per-row
 * control can slot into without knowing anything about the tree.
 */
export function TocRow({ node, leadingControl }: TocRowProps) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {leadingControl != null && (
        <span data-testid="toc-row-leading" className="flex-none">
          {leadingControl}
        </span>
      )}
      <span className="truncate text-sm text-shell-text" title={node.text}>
        {node.text}
      </span>
    </div>
  );
}
