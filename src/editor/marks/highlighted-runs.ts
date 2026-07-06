/**
 * The shared **highlighted-runs query**: given a ProseMirror node, collect the
 * runs of text that carry the {@link ./highlight | highlight mark}.
 *
 * A debater highlights the words they will actually read aloud out of a longer,
 * denser card. Those highlighted runs are meaningful document data (a real
 * queryable mark, never scraped CSS), and more than one feature needs to *pull
 * them out*: the **Extract Highlight** card-cutting tool isolates a card's
 * read-aloud rhetoric into a fresh card, and the **Auto Speech** engine
 * ({@link ../../speech | src/speech}) assembles a speech from the highlighted runs
 * across many cards. This module
 * is that shared primitive, deliberately **not** private to any one tool.
 *
 * It is a pure, position-agnostic read over ProseMirror structure + marks, in the
 * same discipline as the {@link ../../blockfile/card-unit | card-unit API} and the
 * {@link ../../formatting/shrink.classifyRuns | run classifier}: nothing to keep in
 * sync, nothing to invalidate - the answer is derived from the node passed in.
 *
 * ## What it returns
 *
 * One {@link HighlightedRun} per *contiguous* stretch of highlighted text. Adjacent
 * highlighted text nodes (e.g. a highlighted run that is also partly bold) merge
 * into a single logical run so a consumer reads a whole highlighted span at once,
 * while a paragraph boundary between two highlighted runs breaks contiguity into
 * two runs (so paragraph structure is not silently glued together). Each run
 * carries:
 *
 * - `text` - the run's plain text (marks flattened), for a text-only consumer;
 * - `content` - the run's text nodes as re-insertable document-JSON with **every
 *   inline mark preserved** (highlight, bold, `textStyle`/`fontSize`), the form a
 *   tool drops into a new paragraph;
 * - `from`/`to` - the run's range, offset by the `basePos` the caller supplies, so
 *   a caller can pass absolute document positions when it needs to select or delete
 *   the run in place.
 *
 * Positions are valid only against the document version the node was read from -
 * re-derive after any edit, the same snapshot discipline the outline/card-unit
 * queries document.
 */
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { HIGHLIGHT_MARK_NAME } from "./highlight";

/**
 * One contiguous run of highlighted text.
 *
 * `from`/`to` bound the run's text relative to the `basePos` passed to
 * {@link highlightedRuns} (`0` by default, so they are offsets within the walked
 * node's content; pass the node's first inner position to get absolute document
 * positions). `content` is the run's text node(s) as document-JSON with all inline
 * marks intact - the re-insertable payload. `text` is the same content flattened to
 * plain text.
 */
export interface HighlightedRun {
  /** Start of the run, offset by `basePos`. */
  from: number;
  /** End of the run, offset by `basePos`. */
  to: number;
  /** The run's plain text (all inline marks flattened). */
  text: string;
  /** The run's text node(s) as re-insertable document-JSON, marks preserved. */
  content: JSONContent[];
}

/** Whether a node carries the highlight mark. */
function isHighlighted(node: ProseMirrorNode): boolean {
  return node.marks.some((mark) => mark.type.name === HIGHLIGHT_MARK_NAME);
}

/**
 * Collects the highlighted text runs inside `node`, in document order, merging
 * contiguous highlighted text nodes into one run.
 *
 * `basePos` is added to every returned position: pass `0` (the default) to get
 * offsets within `node`'s content, or the absolute position immediately inside
 * `node` (the position of its first content character) to get absolute document
 * positions the caller can select or delete.
 */
export function highlightedRuns(
  node: ProseMirrorNode,
  basePos = 0,
): HighlightedRun[] {
  const runs: HighlightedRun[] = [];
  node.descendants((child, pos) => {
    // Only text leaves can carry the highlight mark; descend into block content.
    if (!child.isText) return true;
    if (!isHighlighted(child)) return false;

    const from = basePos + pos;
    const to = from + child.nodeSize;
    const json = child.toJSON() as JSONContent;
    const previous = runs[runs.length - 1];
    // Merge only when the previous run ends exactly where this one begins - a
    // paragraph boundary consumes a position, so it naturally breaks contiguity.
    if (previous && previous.to === from) {
      previous.to = to;
      previous.text += child.text ?? "";
      previous.content.push(json);
    } else {
      runs.push({ from, to, text: child.text ?? "", content: [json] });
    }
    return false;
  });
  return runs;
}

/**
 * Whether `node` contains any highlighted text - the cheap predicate a tool uses
 * for enablement (e.g. Extract Highlight is only meaningful on a card that has
 * highlighted runs). Short-circuits on the first hit.
 */
export function hasHighlightedRuns(node: ProseMirrorNode): boolean {
  let found = false;
  node.descendants((child) => {
    if (found) return false;
    if (child.isText && isHighlighted(child)) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}
