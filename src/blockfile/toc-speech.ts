/**
 * The **ToC bulk-send -> Speech Doc** pipeline core: gathering the cards filed
 * under one or more checked block-file ToC headings, running them through the
 * shared {@link ../speech.transformToSpeech | Auto Speech engine}, and appending
 * the formatted result onto the *bottom* of the active speech doc's body -
 * non-destructively.
 *
 * A debater ticks the "include this section" checkbox on one or more argument
 * headings in the block-file table of contents and clicks **Send to Speech Doc**;
 * every checked section's cards flow, Auto-Speech-formatted (bold tagline, cite,
 * highlighted read-aloud runs, un-highlighted body stripped, cards separated),
 * onto the end of the speech they are drafting. This module is the model-level
 * seam that does that; the ToC layer owns the checkbox selection state and the
 * button gesture (see {@link ../toc/useTocSelection} and the block-file screen's
 * ToC panel), and the {@link ../speech-doc/active-speech-doc | active-speech-doc
 * contract} names *which* speech doc is the target.
 *
 * ## Non-destructive by construction
 *
 * The block file is only ever **read**: {@link sectionSpeechBlocks} derives
 * document-JSON from the block-file editor's current state without mutating it,
 * and {@link appendBlocksToSpeechBody} writes exclusively into the *speech* doc's
 * own `Y.Doc`. Nothing in the block file changes, so "the source is untouched" is
 * a property of the code, not a convention. Because the append lands in the
 * speech doc's document it persists and reloads through the identical Yjs +
 * y-indexeddb path as every other speech-doc edit - the sent content survives a
 * reload.
 *
 * ## How a "section" is delimited
 *
 * The block-file ToC shows the whole heading {@link ../editor/headings/outline |
 * outline}; a checked heading's *section* is that heading plus every following
 * sibling in the same side region, up to (but not including) the next heading of
 * the same-or-shallower level - the same boundary the
 * {@link ./section-ops.getSectionRange | section-ops boundary contract} uses for
 * top-level argument sections, generalised to any heading level. Walking siblings
 * within the heading's own parent means the gather can never cross the enforced,
 * `isolating` aff/neg boundary. Overlapping selections (a parent heading and a
 * nested one) contribute each card exactly once.
 *
 * ## Positions are a snapshot
 *
 * A checked position is a ProseMirror position, valid only against the block-file
 * document version it was read from (the same snapshot discipline as
 * {@link ../editor/headings/outline.OutlineHeading}). The ToC re-derives the
 * outline on every edit, so the checkbox state a debater sees always matches the
 * live document, and {@link sectionSpeechBlocks} resolves each position against
 * the editor's current state at send time. A position that no longer addresses a
 * heading is skipped rather than throwing.
 */
import type { Editor, JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { transformToSpeech, type SpeechTransformOptions } from "../speech";
import { SPEECH_DOC_BODY_FRAGMENT } from "../speech-doc/speech-doc";

/** The node-type name ProseMirror gives a heading node (Tiptap's default). */
const HEADING_NODE = "heading";

/** The outcome of a {@link sendSectionsToSpeechDoc} bulk send. */
export interface SendSectionsResult {
  /** How many checked sections contributed at least one speech block. */
  readonly sectionCount: number;
  /** How many block-level nodes were appended to the speech doc body in total. */
  readonly blockCount: number;
}

/**
 * Collects, in document order, the direct children of a heading's section: the
 * heading node itself plus every following sibling in the same parent up to the
 * next heading of the same-or-shallower level. Each entry carries the child's
 * absolute position so callers can de-duplicate overlapping sections.
 *
 * Returns an empty array when `pos` does not resolve to a heading node in the
 * current document (a stale position), so a caller can skip it silently.
 */
function sectionChildrenAt(
  doc: ProseMirrorNode,
  pos: number,
): { pos: number; node: ProseMirrorNode }[] {
  const heading = doc.nodeAt(pos);
  if (!heading || heading.type.name !== HEADING_NODE) return [];

  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const startIndex = $pos.index();
  const level = heading.attrs.level as number;

  const children: { pos: number; node: ProseMirrorNode }[] = [];
  let childPos = pos; // `pos` is the position immediately before the heading node.
  for (let i = startIndex; i < parent.childCount; i++) {
    const child = parent.child(i);
    if (
      i > startIndex &&
      child.type.name === HEADING_NODE &&
      (child.attrs.level as number) <= level
    ) {
      break; // the next section begins here
    }
    children.push({ pos: childPos, node: child });
    childPos += child.nodeSize;
  }
  return children;
}

/** The node-type name Tiptap gives a card node (kept local to avoid a cycle). */
const CARD_NODE = "card";

/**
 * Gathers the union of the checked sections' direct children, in document order,
 * de-duplicating overlapping sections so each child appears once, and counting how
 * many *distinct* checked sections contributed at least one card.
 */
function gatherSectionItems(
  doc: ProseMirrorNode,
  checkedPositions: Iterable<number>,
): { items: ProseMirrorNode[]; contributingSectionCount: number } {
  // Process checked headings in document order and de-duplicate by absolute
  // position, so overlapping sections (a heading nested under another checked
  // heading) contribute each child exactly once, in reading order.
  const sorted = [...new Set(checkedPositions)].sort((a, b) => a - b);
  const seen = new Set<number>();
  const items: ProseMirrorNode[] = [];
  let contributingSectionCount = 0;
  for (const pos of sorted) {
    let sectionHadCard = false;
    for (const child of sectionChildrenAt(doc, pos)) {
      if (child.node.type.name === CARD_NODE) sectionHadCard = true;
      if (seen.has(child.pos)) continue;
      seen.add(child.pos);
      items.push(child.node);
    }
    if (sectionHadCard) contributingSectionCount += 1;
  }
  return { items, contributingSectionCount };
}

/**
 * Derives the Auto-Speech-formatted block-level document-JSON for the cards filed
 * under the checked headings, in document order, running them through the shared
 * {@link transformToSpeech | speech engine}.
 *
 * `checkedPositions` are ProseMirror positions of section headings in `editor`'s
 * current document (as the ToC outline reports them). For each, this gathers the
 * heading's section (see the module notes on delimiting), unions the sections
 * (each card contributing once, even when a parent and nested heading are both
 * checked), wraps the collected nodes under a throwaway node, and transforms them.
 * A position that no longer addresses a heading is skipped.
 *
 * Pure over the editor's current state: `editor` is only read, and the returned
 * array is fresh document-JSON. Returns an empty array when nothing is checked or
 * no checked section yields any speech content.
 */
export function sectionSpeechBlocks(
  editor: Editor,
  checkedPositions: Iterable<number>,
  options: SpeechTransformOptions = {},
): JSONContent[] {
  const doc = editor.state.doc;
  const { items } = gatherSectionItems(doc, checkedPositions);
  if (items.length === 0) return [];

  // `create` (unlike `createChecked`) skips content-expression validation, so
  // wrapping arbitrary collected nodes is safe - the engine only walks structure,
  // it never resolves positions against this wrapper.
  const wrapper = doc.type.create(null, Fragment.fromArray(items));
  return transformToSpeech(wrapper, options);
}

/**
 * Appends block-level document-JSON onto the *end* of a speech doc's body
 * fragment, non-destructively, and returns how many blocks were appended.
 *
 * The write goes through a short-lived headless editor bound to the speech doc's
 * body fragment (the shared {@link editorPreset} schema, which carries the bold /
 * highlight / heading nodes the speech blocks use), so the append is an ordinary
 * ProseMirror transaction that flows into the speech doc's `Y.Doc` and persists
 * exactly like a hand-typed edit. The temporary editor is destroyed before
 * returning. A speech doc already open in another editor (the split-screen dock)
 * converges on the appended content through Yjs.
 *
 * A no-op returning `0` when `blocks` is empty.
 */
export function appendBlocksToSpeechBody(
  speechHandle: DocumentHandle,
  blocks: JSONContent[],
  fragmentName: string = SPEECH_DOC_BODY_FRAGMENT,
): number {
  if (blocks.length === 0) return 0;

  const editor = createEditor({
    binding: { handle: speechHandle, fragment: fragmentName },
    extensions: editorPreset(),
  });
  try {
    editor
      .chain()
      .insertContentAt(editor.state.doc.content.size, blocks, {
        updateSelection: false,
      })
      .run();
  } finally {
    editor.destroy();
  }
  return blocks.length;
}

/**
 * The composed bulk send: formats the cards under the checked block-file headings
 * and appends the result onto the bottom of the speech doc's body.
 *
 * Reads `blockFileEditor` only (the block file is never mutated) and writes into
 * `speechHandle`'s own document. Returns how many checked sections contributed
 * content and how many blocks were appended; a `blockCount` of `0` means nothing
 * was written (nothing checked, or the checked sections held no speakable card
 * content).
 */
export function sendSectionsToSpeechDoc(
  blockFileEditor: Editor,
  speechHandle: DocumentHandle,
  checkedPositions: Iterable<number>,
  options: SpeechTransformOptions = {},
): SendSectionsResult {
  const doc = blockFileEditor.state.doc;
  const { items, contributingSectionCount } = gatherSectionItems(
    doc,
    checkedPositions,
  );

  const blocks =
    items.length === 0
      ? []
      : transformToSpeech(
          doc.type.create(null, Fragment.fromArray(items)),
          options,
        );
  const blockCount = appendBlocksToSpeechBody(speechHandle, blocks);

  return {
    sectionCount: blockCount === 0 ? 0 : contributingSectionCount,
    blockCount,
  };
}
