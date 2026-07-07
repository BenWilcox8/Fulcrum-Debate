/**
 * The **Send Flow -> Speech Doc** pipeline core: appending the content of a set of
 * selected flow containers (contentions and/or subpoints) onto the end of a
 * speech doc's body, non-destructively.
 *
 * A debater multi-selects arguments on the flow sheet and sends them into the
 * speech they are currently building. This module is the model-level seam that
 * performs that append; the flow-canvas layer owns the Shift+Click selection
 * state and the Ctrl/Cmd+Enter gesture that calls it (see
 * {@link ./canvas/useFlowSelection} and {@link ./canvas/SendToSpeechControl}), and
 * the {@link ../speech-doc/active-speech-doc | active-speech-doc contract} names
 * *which* speech doc is the target.
 *
 * ## Non-destructive by construction
 *
 * The flow side is **read-only**: each selected container's own content fragment
 * (`contention:<id>` / `subpoint:<id>`) is read, its prose paragraphs deep-cloned,
 * and the clones pushed onto the speech doc's body fragment. Nothing in the
 * flow-sheet document is mutated, so "the flow is completely untouched" is a
 * property of the code, not a convention. Because the paragraphs are written into
 * the speech doc's own `Y.Doc`, they persist and reload through the identical Yjs +
 * y-indexeddb path as every other speech-doc edit - the append survives a reload.
 *
 * ## Why flatten to paragraphs (and copy via `clone()`)
 *
 * A flow box stores its text under the argument-row schema
 * (`argument > response > paragraph`, see {@link ./argument-rows}); a speech doc
 * body is plain prose (`block+`), which has no `argument`/`response` node types.
 * So the pipeline extracts just the `paragraph` elements - the shared node type -
 * and appends those. Each paragraph is copied with Yjs `clone()` (an unintegrated
 * deep copy), which preserves every inline mark (bold, highlight, `textStyle` /
 * `fontSize`) losslessly and doc-agnostically, exactly as the cross-application
 * copy does. Rich *reformatting* of the sent content (Auto Speech shaping) is a
 * separate PRD and deliberately out of scope here: this is a faithful append.
 */
import * as Y from "yjs";

import type { DocumentHandle } from "../documents/core";
import { readFlowContainerTree } from "./canvas/flow-collapse";
import { contentionContentFragment } from "./contention";
import { subpointContentFragment } from "./subpoint";
import { SPEECH_DOC_BODY_FRAGMENT } from "../speech-doc/speech-doc";

/** The outcome of an {@link appendFlowNodesToSpeechDoc} append. */
export interface SendFlowResult {
  /** How many selected containers contributed at least one non-empty paragraph. */
  readonly nodeCount: number;
  /** How many paragraphs were appended to the speech doc body in total. */
  readonly paragraphCount: number;
}

/** Whether a `<paragraph>` element (or any descendant) carries visible text. */
function paragraphHasText(node: Y.XmlElement): boolean {
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText && child.length > 0) return true;
    if (child instanceof Y.XmlElement && paragraphHasText(child)) return true;
  }
  return false;
}

/**
 * Walks a flow-box content tree (`argument > response > paragraph`) and returns a
 * deep clone of every non-empty `paragraph` element, in document order. The clones
 * are unintegrated, so they can be pushed onto any doc's fragment; every inline
 * mark is preserved. Empty paragraphs (the auto-filled placeholder of an untouched
 * box) are skipped so the speech never gains blank lines.
 */
function collectParagraphClones(
  node: Y.XmlElement | Y.XmlFragment,
): Y.XmlElement[] {
  const paragraphs: Y.XmlElement[] = [];
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === "paragraph") {
      if (paragraphHasText(child)) paragraphs.push(child.clone());
    } else {
      paragraphs.push(...collectParagraphClones(child));
    }
  }
  return paragraphs;
}

/**
 * Appends the prose content of the selected flow containers onto the end of a
 * speech doc's body, non-destructively.
 *
 * `nodeIds` is the set of selected container ids (contentions and/or subpoints);
 * the append order is the flow's own reading order (columns, then contentions
 * top-to-bottom, then their subpoints - the order {@link readFlowContainerTree}
 * enumerates), regardless of the order the ids were selected in. Ids that no
 * longer resolve to a live container (e.g. a deleted node) are skipped. When no
 * selected container yields any non-empty paragraph, nothing is written and a
 * zero result is returned.
 *
 * The flow-sheet document is only read; every write lands in the speech doc's own
 * document inside a single transaction (one undo step).
 */
export function appendFlowNodesToSpeechDoc(
  flowHandle: DocumentHandle,
  speechHandle: DocumentHandle,
  nodeIds: Iterable<string>,
  bodyFragmentName: string = SPEECH_DOC_BODY_FRAGMENT,
): SendFlowResult {
  const selected = new Set(nodeIds);
  if (selected.size === 0) return { nodeCount: 0, paragraphCount: 0 };

  const { allIds, parentOf } = readFlowContainerTree(flowHandle);
  const fragmentNameFor = (id: string): string =>
    parentOf.has(id)
      ? subpointContentFragment(id)
      : contentionContentFragment(id);

  const paragraphs: Y.XmlElement[] = [];
  let nodeCount = 0;
  for (const id of allIds) {
    if (!selected.has(id)) continue;
    const source = flowHandle.doc.getXmlFragment(fragmentNameFor(id));
    const clones = collectParagraphClones(source);
    if (clones.length > 0) nodeCount += 1;
    paragraphs.push(...clones);
  }

  if (paragraphs.length === 0) return { nodeCount: 0, paragraphCount: 0 };

  const body = speechHandle.doc.getXmlFragment(bodyFragmentName);
  speechHandle.doc.transact(() => {
    body.push(paragraphs);
  });

  return { nodeCount, paragraphCount: paragraphs.length };
}
