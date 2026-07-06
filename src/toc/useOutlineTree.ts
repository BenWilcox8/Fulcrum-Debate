import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";

import {
  buildOutlineTree,
  observeOutline,
  type OutlineTreeNode,
} from "../editor/headings";

/**
 * Subscribes to an editor's heading outline and returns it as the nested tree a
 * table of contents renders.
 *
 * It layers the two heading-layer seams without re-deriving either: it observes
 * the live outline through {@link observeOutline} (which fires immediately and
 * again on every document change, ignoring selection-only moves) and shapes each
 * emission with {@link buildOutlineTree}. A nullish editor yields an empty tree,
 * so callers can render their container before the editor exists (the local-
 * first boot rule). The subscription follows the editor identity, re-subscribing
 * when a new editor is created and detaching on unmount.
 */
export function useOutlineTree(editor: Editor | null): OutlineTreeNode[] {
  const [tree, setTree] = useState<OutlineTreeNode[]>([]);

  useEffect(() => {
    if (!editor) {
      setTree([]);
      return;
    }
    const unsubscribe = observeOutline(editor, (outline) => {
      setTree(buildOutlineTree(outline));
    });
    return unsubscribe;
  }, [editor]);

  return tree;
}
