/**
 * Behavioural tests for the **drop target** half of the single-card
 * drag-into-Speech-Doc pipeline.
 *
 * These drive a real speech-doc editor (the shared preset plus
 * {@link SpeechCardDrop}) over the `fake-indexeddb` harness, and prove the drop
 * *places* a dragged card's speech blocks at the resolved position - not a
 * bottom-append. jsdom has no layout engine, so pointer→position mapping
 * (`view.posAtCoords`) is stubbed to a known position; the observable outcome is
 * *where the blocks land in the document*, which is exactly the drop-target
 * resolution the pipeline promises.
 *
 * Positions that drive the assertions come from an independent document walk,
 * never the code under test.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { SPEECH_DOC_BODY_FRAGMENT } from "./speech-doc";
import { writeCardSpeechBlocks } from "./card-drag-transfer";
import {
  SpeechCardDrop,
  snapDropPos,
  insertSpeechBlocksAt,
  handleSpeechCardDragOver,
  handleSpeechCardDrop,
  speechCardDropPluginKey,
} from "./card-drop";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  editors = [];
  handles = [];
});

async function openSpeechEditor(id: string): Promise<Editor> {
  const handle = openDocument({ id, kind: "speech-doc" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: SPEECH_DOC_BODY_FRAGMENT },
    extensions: editorPreset({ extensions: [SpeechCardDrop] }),
  });
  editors.push(editor);
  return editor;
}

function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

/** Seed the speech body with the given paragraphs (replacing the empty default). */
function seedParagraphs(editor: Editor, texts: string[]): void {
  editor
    .chain()
    .setContent(texts.map(para))
    .run();
}

/** The ordered top-level block texts of the speech body. */
function blockTexts(editor: Editor): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((node) => out.push(node.textContent));
  return out;
}

/** Independent walk: the position immediately inside the Nth top-level block (0-based). */
function insideBlock(editor: Editor, index: number): number {
  let pos: number | null = null;
  let seen = -1;
  editor.state.doc.forEach((_node, offset) => {
    seen += 1;
    if (seen === index) pos = offset + 1;
  });
  if (pos === null) throw new Error(`no block at index ${index}`);
  return pos;
}

/** A minimal DataTransfer stand-in (jsdom ships none) exposing the surface used. */
function makeDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    dropEffect: "none",
    effectAllowed: "none",
    get types() {
      return Array.from(store.keys());
    },
    setData(type: string, data: string) {
      store.set(type, data);
    },
    getData(type: string) {
      return store.get(type) ?? "";
    },
    clearData(type?: string) {
      if (type) store.delete(type);
      else store.clear();
    },
  } as unknown as DataTransfer;
}

/** A card-speech drag payload on a DataTransfer. */
function cardDrag(blocks: JSONContent[]): DataTransfer {
  const dt = makeDataTransfer();
  writeCardSpeechBlocks(dt, blocks);
  return dt;
}

/** A minimal drop/dragover event carrying a DataTransfer and pointer coords. */
function dragEvent(dataTransfer: DataTransfer | null): DragEvent {
  return {
    dataTransfer,
    clientX: 10,
    clientY: 10,
    preventDefault: vi.fn(),
  } as unknown as DragEvent;
}

/** Stub the view's coordinate mapping so a drop resolves to a known position. */
function stubDropAt(editor: Editor, pos: number): void {
  editor.view.posAtCoords = () => ({ pos, inside: pos });
}

describe("snapDropPos", () => {
  it("snaps a position in a block's first half to the boundary before it", async () => {
    const editor = await openSpeechEditor("drop-snap-1");
    seedParagraphs(editor, ["first", "second"]);
    const doc = editor.state.doc;

    const secondInside = insideBlock(editor, 1);
    const $second = doc.resolve(secondInside);
    // A position right at the start of the second block snaps before it.
    expect(snapDropPos(doc, secondInside)).toBe($second.before(1));
  });

  it("snaps a position in a block's second half to the boundary after it", async () => {
    const editor = await openSpeechEditor("drop-snap-2");
    seedParagraphs(editor, ["first", "second"]);
    const doc = editor.state.doc;

    const $first = doc.resolve(insideBlock(editor, 0));
    // Near the end of the first block snaps to just after it.
    expect(snapDropPos(doc, $first.end(1))).toBe($first.after(1));
  });

  it("clamps out-of-range positions", async () => {
    const editor = await openSpeechEditor("drop-snap-3");
    seedParagraphs(editor, ["only"]);
    const doc = editor.state.doc;
    expect(snapDropPos(doc, -50)).toBe(0);
    expect(snapDropPos(doc, 9999)).toBe(doc.content.size);
  });
});

describe("insertSpeechBlocksAt", () => {
  it("inserts blocks at the resolved block boundary (precise placement, not append)", async () => {
    const editor = await openSpeechEditor("drop-insert-1");
    seedParagraphs(editor, ["A", "B", "C"]);

    // Resolve a position inside block "B" (first half) -> boundary before it.
    const raw = insideBlock(editor, 1);
    insertSpeechBlocksAt(editor.view, [para("INSERTED")], raw);

    expect(blockTexts(editor)).toEqual(["A", "INSERTED", "B", "C"]);
  });

  it("returns the inserted range", async () => {
    const editor = await openSpeechEditor("drop-insert-2");
    seedParagraphs(editor, ["A", "B"]);
    const boundary = editor.state.doc.resolve(insideBlock(editor, 1)).before(1);

    const range = insertSpeechBlocksAt(editor.view, [para("X")], insideBlock(editor, 1));
    expect(range.from).toBe(boundary);
    expect(range.to).toBeGreaterThan(range.from);
  });
});

describe("handleSpeechCardDrop", () => {
  it("drops a card's speech at the resolved position (observable placement)", async () => {
    const editor = await openSpeechEditor("drop-1");
    seedParagraphs(editor, ["A", "B", "C"]);
    // The pointer resolves into block "C" (first half) -> land before "C".
    stubDropAt(editor, insideBlock(editor, 2));

    const dt = cardDrag([para("CARD TAGLINE"), para("Card evidence")]);
    const handled = handleSpeechCardDrop(editor.view, dragEvent(dt));

    expect(handled).toBe(true);
    expect(blockTexts(editor)).toEqual([
      "A",
      "B",
      "CARD TAGLINE",
      "Card evidence",
      "C",
    ]);
  });

  it("ignores a drag that carries no card-speech payload", async () => {
    const editor = await openSpeechEditor("drop-2");
    seedParagraphs(editor, ["A", "B"]);
    stubDropAt(editor, insideBlock(editor, 1));

    const plain = makeDataTransfer();
    plain.setData("text/plain", "nope");
    const handled = handleSpeechCardDrop(editor.view, dragEvent(plain));

    expect(handled).toBe(false); // not consumed - default handling proceeds
    expect(blockTexts(editor)).toEqual(["A", "B"]); // nothing inserted
  });

  it("is a no-op when the pointer is not over content", async () => {
    const editor = await openSpeechEditor("drop-3");
    seedParagraphs(editor, ["A"]);
    editor.view.posAtCoords = () => null;

    const dt = cardDrag([para("X")]);
    const handled = handleSpeechCardDrop(editor.view, dragEvent(dt));
    expect(handled).toBe(true); // consumed (it was our drag)...
    expect(blockTexts(editor)).toEqual(["A"]); // ...but nothing placed
  });
});

describe("handleSpeechCardDragOver", () => {
  it("accepts a card drag (copy cursor) and sets the drop indicator", async () => {
    const editor = await openSpeechEditor("dragover-1");
    seedParagraphs(editor, ["A", "B"]);
    stubDropAt(editor, insideBlock(editor, 1));

    const dt = cardDrag([para("X")]);
    const event = dragEvent(dt);
    const handled = handleSpeechCardDragOver(editor.view, event);

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(dt.dropEffect).toBe("copy");
    // A drop indicator now marks where the card would land.
    const state = speechCardDropPluginKey.getState(editor.view.state);
    expect(state?.dropPos).not.toBeNull();
  });

  it("ignores an unrelated drag", async () => {
    const editor = await openSpeechEditor("dragover-2");
    seedParagraphs(editor, ["A"]);
    const plain = makeDataTransfer();
    plain.setData("text/plain", "x");
    expect(handleSpeechCardDragOver(editor.view, dragEvent(plain))).toBe(false);
  });
});
