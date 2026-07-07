/**
 * Whole-pipeline integration test for the single-card drag-into-Speech-Doc
 * pipeline: it composes the {@link ./card-drag | drag source} (over a real
 * block-file + card editor) and the {@link ./card-drop | drop target} (over a real
 * speech-doc editor) through the shared {@link ./card-drag-transfer | DataTransfer
 * wire format}, exactly as a live drag does - drag start writes the card's
 * Auto-Speech-formatted copy onto the drag, the speech doc reads it back and
 * inserts it at the resolved drop position.
 *
 * It proves the two acceptance properties that only show up end-to-end: the
 * dropped content is the Auto-Speech-formatted card (with its heading, bold
 * tagline, highlighted body) landing at the drop position (precise placement), and
 * the **source block file is left completely unchanged**. jsdom has no layout, so
 * the pointer→position map is stubbed to a known position; the observable outcome
 * is where the speech blocks land.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME } from "../editor/marks";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  getSideRegion,
} from "../blockfile";
import { SPEECH_DOC_BODY_FRAGMENT } from "./speech-doc";
import { CardSpeechDrag, buildCardSpeechDragData } from "./card-drag";
import { writeCardSpeechBlocks } from "./card-drag-transfer";
import { SpeechCardDrop, handleSpeechCardDrop } from "./card-drop";

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

async function openBlockFile(id: string): Promise<Editor> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions, CardSpeechDrag],
    }),
  });
  editors.push(editor);
  return editor;
}

async function openSpeech(id: string): Promise<Editor> {
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
  } as unknown as DataTransfer;
}

function insideFirstCard(editor: Editor): number {
  let pos: number | null = null;
  editor.state.doc.descendants((node, at) => {
    if (pos === null && node.type.name === "card") {
      pos = at + 1;
      return false;
    }
    return true;
  });
  if (pos === null) throw new Error("no card");
  return pos;
}

function insideBlock(editor: Editor, index: number): number {
  let pos: number | null = null;
  let seen = -1;
  editor.state.doc.forEach((_node, offset) => {
    seen += 1;
    if (seen === index) pos = offset + 1;
  });
  if (pos === null) throw new Error(`no block at ${index}`);
  return pos;
}

function blockTexts(editor: Editor): string[] {
  const out: string[] = [];
  editor.state.doc.forEach((node) => out.push(node.textContent));
  return out;
}

/** Whether any text run in the doc carries the given mark. */
function hasMarkedText(editor: Editor, mark: string, text: string): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (
      node.isText &&
      node.text === text &&
      node.marks.some((m) => m.type.name === mark)
    ) {
      found = true;
    }
  });
  return found;
}

describe("drag a card from the block file into the speech doc", () => {
  it("drops an Auto-Speech-formatted copy at the drop position, source unchanged", async () => {
    const block = await openBlockFile("integ-block");
    const affEnd = getSideRegion(block, "aff").contentEnd;
    block
      .chain()
      .insertContentAt(
        affEnd,
        [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "AT: Econ" }] },
          {
            type: "card",
            content: [
              { type: "cardTag", content: [{ type: "text", text: "DA" }] },
              { type: "cardTagline", content: [{ type: "text", text: "Growth solves" }] },
              { type: "cardCite", content: [{ type: "text", text: "Jones 25" }] },
              {
                type: "cardBody",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Read aloud part", marks: [{ type: HIGHLIGHT_MARK_NAME }] },
                      { type: "text", text: " silent tail" },
                    ],
                  },
                ],
              },
            ],
          } satisfies JSONContent,
        ],
        { updateSelection: false },
      )
      .run();

    const speech = await openSpeech("integ-speech");
    speech
      .chain()
      .setContent([
        { type: "paragraph", content: [{ type: "text", text: "Intro" }] },
        { type: "paragraph", content: [{ type: "text", text: "Outro" }] },
      ])
      .run();

    const blockBefore = block.state.doc.toJSON();

    // --- The drag gesture: dragstart builds + writes the payload. ---
    const dragData = buildCardSpeechDragData(block.state.doc, insideFirstCard(block));
    expect(dragData).not.toBeNull();
    const dt = makeDataTransfer();
    writeCardSpeechBlocks(dt, dragData!.blocks);

    // --- The drop: pointer resolves into "Outro" (first half) -> land before it. ---
    speech.view.posAtCoords = () => ({ pos: insideBlock(speech, 1), inside: 1 });
    const dropped = handleSpeechCardDrop(speech.view, {
      dataTransfer: dt,
      clientX: 5,
      clientY: 5,
      preventDefault: vi.fn(),
    } as unknown as DragEvent);
    expect(dropped).toBe(true);

    // The heading + Auto-Speech card content landed between Intro and Outro.
    const texts = blockTexts(speech);
    expect(texts).toEqual([
      "Intro",
      "AT: Econ",
      "Growth solves",
      "Jones 25",
      "Read aloud part",
      "Outro",
    ]);
    // Formatting: the tagline is bold; the un-highlighted body tail was stripped.
    expect(hasMarkedText(speech, BOLD_MARK_NAME, "Growth solves")).toBe(true);
    expect(texts).not.toContain("silent tail");

    // The source block file is completely untouched by the drag.
    expect(block.state.doc.toJSON()).toEqual(blockBefore);
  });
});
