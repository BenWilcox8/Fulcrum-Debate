import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";

import { getOutline } from "../editor/headings";
import { findActiveHeading, type HeadingOffset } from "./active-heading";

/**
 * Measures each heading's top offset within the scroll container's content.
 *
 * For every heading in the editor's outline it reads the rendered heading
 * element via `view.nodeDOM(pos)` and converts its viewport rect into an offset
 * relative to the container's scrollable content (`rect.top - containerTop +
 * scrollTop`) - i.e. the `scrollTop` at which the heading reaches the top of the
 * visible area, exactly what {@link findActiveHeading} compares against.
 * Headings whose DOM is not currently an element (e.g. mid-transaction) are
 * skipped rather than guessed at.
 */
function measureHeadingOffsets(
  editor: Editor,
  container: HTMLElement,
): HeadingOffset[] {
  const containerTop = container.getBoundingClientRect().top;
  const scrollTop = container.scrollTop;
  const offsets: HeadingOffset[] = [];

  for (const { pos } of getOutline(editor)) {
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) {
      continue;
    }
    const top = dom.getBoundingClientRect().top - containerTop + scrollTop;
    offsets.push({ pos, top });
  }

  return offsets;
}

/**
 * Tracks which heading is currently in view and returns its `pos`, updating live
 * as the user scrolls the document. `null` means there is no active heading (no
 * editor, no scroll container, or an empty outline).
 *
 * It listens to the scroll container's `scroll` events and to the editor's
 * document changes (which move heading offsets), re-measuring the outline's
 * offsets and deriving the single active heading via {@link findActiveHeading}
 * each time. Measurement needs real layout, so the scroll container is passed in
 * explicitly (the block-file screen hands over its editor-wrapping scroll
 * region); a nullish editor or container yields `null`. The listener chain
 * follows editor and container identity and detaches on unmount, so nothing
 * leaks and nothing awaits the network.
 */
export function useActiveHeading(
  editor: Editor | null,
  scrollContainer: HTMLElement | null,
): number | null {
  const [activePos, setActivePos] = useState<number | null>(null);

  useEffect(() => {
    if (!editor || !scrollContainer) {
      setActivePos(null);
      return;
    }

    const recompute = () => {
      const offsets = measureHeadingOffsets(editor, scrollContainer);
      setActivePos(findActiveHeading(offsets, scrollContainer.scrollTop));
    };

    recompute();
    scrollContainer.addEventListener("scroll", recompute, { passive: true });
    // Document changes shift every later heading's offset, so re-measure on
    // update too (selection-only transactions do not fire this event).
    editor.on("update", recompute);

    return () => {
      scrollContainer.removeEventListener("scroll", recompute);
      editor.off("update", recompute);
    };
  }, [editor, scrollContainer]);

  return activePos;
}
