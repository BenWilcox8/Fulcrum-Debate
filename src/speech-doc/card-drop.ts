/**
 * The **drop target** half of the single-card drag-into-Speech-Doc pipeline: it
 * lets a speech doc editor accept a card dragged from the block file, show where
 * the card will land, and insert the Auto-Speech-formatted copy at the drop
 * position.
 *
 * The {@link ./card-drag | drag source} has already copied the card, run it
 * through the Auto Speech engine, and written the speech-ready block-level
 * document-JSON onto the drag in the shared {@link ./card-drag-transfer | wire
 * format}. This side is therefore schema-agnostic - it never touches a card. It:
 *
 * - **accepts** the drag (only when it carries a card-speech payload) so the
 *   browser shows the copy cursor, and
 * - **shows a drop zone**: a live indicator marking the block boundary the card
 *   will land at, updated as the pointer moves, and
 * - on drop, **inserts** the speech blocks at that boundary - *precise placement*,
 *   not a bottom-append.
 *
 * ## Precise placement: resolve then snap to a block boundary
 *
 * A pointer drop lands at an arbitrary character position. Speech content is
 * block-level (paragraphs, a heading), so inserting mid-paragraph would split it.
 * {@link resolveSpeechDropPos} maps the pointer to a document position and
 * {@link snapDropPos} rounds it to the nearest top-level block boundary (before
 * the block if the pointer is in its top half, after it otherwise). The blocks are
 * then inserted at that clean boundary, so the drop respects where the debater
 * aimed while never corrupting existing blocks. `snapDropPos` is a pure function
 * of `(doc, pos)`, so the resolution is directly testable as observable placement.
 */
import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { hasCardSpeechDrag, readCardSpeechBlocks } from "./card-drag-transfer";

/**
 * Rounds a raw document position to the nearest **top-level block boundary**, so
 * inserted block content never splits an existing block.
 *
 * If `rawPos` sits inside a top-level block, the boundary chosen is *before* the
 * block when the position is in its first half and *after* it otherwise; a
 * position already between top-level blocks is returned unchanged. Pure and
 * deterministic - the seam that makes drop-target resolution testable without a
 * layout engine.
 */
export function snapDropPos(doc: ProseMirrorNode, rawPos: number): number {
  const size = doc.content.size;
  const pos = Math.max(0, Math.min(rawPos, size));
  const $pos = doc.resolve(pos);
  if ($pos.depth === 0) return pos; // already between top-level nodes

  const start = $pos.start(1);
  const end = $pos.end(1);
  const mid = (start + end) / 2;
  return pos <= mid ? $pos.before(1) : $pos.after(1);
}

/**
 * Resolves a pointer position to the block boundary a card drop should land at, or
 * `null` when the pointer is not over document content. Composes the view's
 * coordinate mapping with {@link snapDropPos}.
 */
export function resolveSpeechDropPos(
  view: EditorView,
  coords: { clientX: number; clientY: number },
): number | null {
  const at = view.posAtCoords({ left: coords.clientX, top: coords.clientY });
  if (!at) return null;
  return snapDropPos(view.state.doc, at.pos);
}

/**
 * Inserts speech blocks into the editor at (the block boundary nearest) `rawPos`
 * and returns the inserted range. The blocks are parsed against the editor's own
 * schema, so only nodes/marks the speech doc understands are inserted. Snaps
 * `rawPos` to a block boundary itself, so it is safe to call with any position.
 */
export function insertSpeechBlocksAt(
  view: EditorView,
  blocks: JSONContent[],
  rawPos: number,
): { from: number; to: number } {
  const { state } = view;
  const pos = snapDropPos(state.doc, rawPos);
  const nodes = blocks.map((block) => state.schema.nodeFromJSON(block));
  const fragment = Fragment.fromArray(nodes);
  const tr = state.tr.insert(pos, fragment);
  view.dispatch(tr.scrollIntoView());
  return { from: pos, to: pos + fragment.size };
}

/** The plugin key for the speech-doc card-drop plugin (also holds the drop indicator). */
export const speechCardDropPluginKey = new PluginKey<SpeechCardDropState>(
  "speechCardDrop",
);

/** The plugin's view-state: the block boundary a hovering card drop would land at. */
interface SpeechCardDropState {
  /** The document position of the drop indicator, or `null` when no card is over. */
  dropPos: number | null;
}

/** Reads the plugin's current drop position from an editor state. */
function currentDropPos(view: EditorView): number | null {
  return speechCardDropPluginKey.getState(view.state)?.dropPos ?? null;
}

/** Dispatches a meta transaction updating (or clearing) the drop indicator. */
function setDropPos(view: EditorView, dropPos: number | null): void {
  if (currentDropPos(view) === dropPos) return;
  view.dispatch(
    view.state.tr.setMeta(speechCardDropPluginKey, { dropPos }),
  );
}

/**
 * `dragover` handler: accept a card-speech drag (so the browser shows the copy
 * cursor) and move the drop indicator to the resolved boundary. Returns `false`
 * for any other drag so normal handling is unaffected.
 */
export function handleSpeechCardDragOver(
  view: EditorView,
  event: DragEvent,
): boolean {
  if (!hasCardSpeechDrag(event.dataTransfer)) return false;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  setDropPos(
    view,
    resolveSpeechDropPos(view, { clientX: event.clientX, clientY: event.clientY }),
  );
  return true;
}

/** `dragleave` handler: clear the drop indicator when the card genuinely leaves the editor. */
export function handleSpeechCardDragLeave(
  view: EditorView,
  event: DragEvent,
): boolean {
  if (!hasCardSpeechDrag(event.dataTransfer)) return false;
  if (event.relatedTarget && view.dom.contains(event.relatedTarget as Node)) return false;
  setDropPos(view, null);
  return false;
}

/** The result reported to {@link SpeechCardDropOptions.onDrop} after a drop lands. */
export interface SpeechCardDropInfo {
  /** How many block-level nodes were inserted. */
  blockCount: number;
  /** The position the blocks were inserted at. */
  pos: number;
}

/**
 * `drop` handler: insert the dragged card's speech blocks at the resolved boundary.
 * Consumes only card-speech drags (returns `false` otherwise). Clears the
 * indicator, and is a no-op when the payload is empty or the pointer is not over
 * content.
 */
export function handleSpeechCardDrop(
  view: EditorView,
  event: DragEvent,
  onDrop?: (info: SpeechCardDropInfo) => void,
): boolean {
  if (!hasCardSpeechDrag(event.dataTransfer)) return false;
  event.preventDefault();

  const blocks = readCardSpeechBlocks(event.dataTransfer);
  const rawPos = resolveSpeechDropPos(view, {
    clientX: event.clientX,
    clientY: event.clientY,
  });
  setDropPos(view, null);

  if (!blocks || blocks.length === 0 || rawPos == null) return true;

  const range = insertSpeechBlocksAt(view, blocks, rawPos);
  onDrop?.({ blockCount: blocks.length, pos: range.from });
  return true;
}

/** Builds the drop-indicator decoration set for the current plugin state. */
function dropDecorations(
  doc: ProseMirrorNode,
  dropPos: number | null,
): DecorationSet {
  if (dropPos == null) return DecorationSet.empty;
  const indicator = () => {
    const el = document.createElement("div");
    el.className = "speech-card-drop-indicator";
    el.setAttribute("data-testid", "speech-card-drop-indicator");
    return el;
  };
  return DecorationSet.create(doc, [
    Decoration.widget(dropPos, indicator, {
      side: -1,
      key: "speech-card-drop-indicator",
    }),
  ]);
}

/** Options for {@link SpeechCardDrop}. */
export interface SpeechCardDropOptions {
  /** Called after a card is dropped and its speech inserted. */
  onDrop?: (info: SpeechCardDropInfo) => void;
}

/**
 * The speech-doc editor extension that accepts a card dragged from the block file.
 *
 * Layer it onto the speech doc's editor preset. It installs a ProseMirror plugin
 * that, for a card-speech drag: accepts the drag (copy cursor), tracks a live drop
 * indicator at the target block boundary (a view-only widget decoration and an
 * `is-card-drop-target` class on the editable while a card hovers), and on drop
 * inserts the Auto-Speech-formatted blocks at that boundary. Non-card drags are
 * untouched.
 */
export const SpeechCardDrop = Extension.create<SpeechCardDropOptions>({
  name: "speechCardDrop",

  addOptions() {
    return { onDrop: undefined };
  },

  addProseMirrorPlugins() {
    const onDrop = this.options.onDrop;
    return [
      new Plugin<SpeechCardDropState>({
        key: speechCardDropPluginKey,
        state: {
          init() {
            return { dropPos: null };
          },
          apply(tr, value) {
            const meta = tr.getMeta(speechCardDropPluginKey) as
              | SpeechCardDropState
              | undefined;
            if (meta) return meta;
            if (value.dropPos != null && tr.docChanged) {
              return { dropPos: tr.mapping.map(value.dropPos) };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = speechCardDropPluginKey.getState(state);
            return dropDecorations(state.doc, pluginState?.dropPos ?? null);
          },
          attributes(state): Record<string, string> {
            const pluginState = speechCardDropPluginKey.getState(state);
            return pluginState?.dropPos != null
              ? { class: "is-card-drop-target" }
              : {};
          },
          handleDOMEvents: {
            dragover: (view, event) => handleSpeechCardDragOver(view, event),
            dragleave: (view, event) => handleSpeechCardDragLeave(view, event),
            drop: (view, event) => handleSpeechCardDrop(view, event, onDrop),
          },
        },
      }),
    ];
  },
});
