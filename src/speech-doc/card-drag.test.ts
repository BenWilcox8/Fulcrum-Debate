/**
 * Behavioural tests for the **drag source** half of the single-card
 * drag-into-Speech-Doc pipeline.
 *
 * These drive a real block-file + card editor (the `fake-indexeddb` harness the
 * other block-file suites use) with the {@link CardSpeechDrag} extension
 * installed, and assert on the Auto-Speech-formatted payload a drag produces and
 * on the drag handles the extension renders - never on ProseMirror internals. The
 * Auto Speech engine itself is tested separately; here we prove the drag *copies*
 * a card (with its heading) into speech-ready blocks and leaves the block file
 * untouched.
 *
 * Positions that drive the assertions come from an independent document walk,
 * never the code under test.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { HIGHLIGHT_MARK_NAME, BOLD_MARK_NAME } from "../editor/marks";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  getSideRegion,
} from "../blockfile";
import { CardSpeechDrag, buildCardSpeechDragData } from "./card-drag";
import {
  CARD_SPEECH_DRAG_MIME,
  writeCardSpeechBlocks,
  readCardSpeechBlocks,
  hasCardSpeechDrag,
} from "./card-drag-transfer";

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

async function openEditor(id: string): Promise<Editor> {
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

interface Run {
  text: string;
  marks?: JSONContent["marks"];
}

function hl(): JSONContent["marks"] {
  return [{ type: HIGHLIGHT_MARK_NAME }];
}

function heading(text: string): JSONContent {
  return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] };
}

function cardWith(
  paragraphs: Run[][],
  fields?: { tag?: string; tagline?: string; cite?: string },
): JSONContent {
  const textRegion = (type: string, text?: string): JSONContent =>
    text ? { type, content: [{ type: "text", text }] } : { type };
  return {
    type: "card",
    content: [
      textRegion("cardTag", fields?.tag ?? "T"),
      textRegion("cardTagline", fields?.tagline),
      textRegion("cardCite", fields?.cite),
      {
        type: "cardBody",
        content: paragraphs.map((runs) => ({
          type: "paragraph",
          content: runs.map((r) => ({
            type: "text",
            text: r.text,
            ...(r.marks ? { marks: r.marks } : {}),
          })),
        })),
      },
    ],
  };
}

/** Insert a heading then a card at the end of a side, returning the card's inside position. */
function seed(
  editor: Editor,
  side: "aff" | "neg",
  content: JSONContent[],
): void {
  const at = getSideRegion(editor, side).contentEnd;
  editor.chain().insertContentAt(at, content, { updateSelection: false }).run();
}

/** Independent walk: the position immediately inside the Nth card (0-based). */
function insideCard(editor: Editor, index = 0): number {
  let seen = -1;
  let pos: number | null = null;
  editor.state.doc.descendants((node, at) => {
    if (node.type.name === "card") {
      seen += 1;
      if (seen === index) pos = at + 1;
      return false;
    }
    return true;
  });
  if (pos === null) throw new Error(`no card at index ${index}`);
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
  } as unknown as DataTransfer;
}

/** Read a block's flattened text and mark type names on its first inline run. */
function blockText(block: JSONContent): string {
  if (block.type === "text") return block.text ?? "";
  return (block.content ?? []).map(blockText).join("");
}

describe("buildCardSpeechDragData", () => {
  it("copies a card and its section heading into Auto-Speech-formatted blocks", async () => {
    const editor = await openEditor("drag-1");
    seed(editor, "aff", [
      heading("AT: Warming"),
      cardWith(
        [[{ text: "The planet warms fast", marks: hl() }, { text: " unhighlighted tail" }]],
        { tag: "T", tagline: "Warming is real", cite: "Smith 24" },
      ),
    ]);

    const data = buildCardSpeechDragData(editor.state.doc, insideCard(editor));
    expect(data).not.toBeNull();
    const blocks = data!.blocks;

    // The section heading travels with the card, preserved as a heading.
    expect(blocks[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(blockText(blocks[0])).toBe("AT: Warming");
    expect(data!.sectionLabel).toBe("AT: Warming");

    const texts = blocks.map(blockText);
    // Bold tagline, cite, and only the *highlighted* run of the body (flattened).
    expect(texts).toContain("Warming is real");
    expect(texts).toContain("Smith 24");
    expect(texts).toContain("The planet warms fast");
    expect(texts).not.toContain("unhighlighted tail");
    // The tag is a tactical label - omitted from a speech by default.
    expect(texts).not.toContain("T");

    // The tagline is bold in the speech (card-region CSS does not reach a speech doc).
    const taglineBlock = blocks.find((b) => blockText(b) === "Warming is real")!;
    const mark = taglineBlock.content?.[0]?.marks?.[0]?.type;
    expect(mark).toBe(BOLD_MARK_NAME);
  });

  it("returns null when the position is not inside a card", async () => {
    const editor = await openEditor("drag-2");
    seed(editor, "aff", [cardWith([[{ text: "x", marks: hl() }]], { tagline: "y" })]);
    // Position 0 is before the aff section, not inside any card.
    expect(buildCardSpeechDragData(editor.state.doc, 0)).toBeNull();
  });

  it("returns null for an empty card (no read-aloud content)", async () => {
    const editor = await openEditor("drag-3");
    seed(editor, "aff", [cardWith([[{ text: "not highlighted" }]], { tag: "T" })]);
    // Tagline/cite empty and body has no highlighted runs -> nothing to speak.
    expect(buildCardSpeechDragData(editor.state.doc, insideCard(editor))).toBeNull();
  });

  it("scopes the heading to the card's own side (a neg card never picks up an aff heading)", async () => {
    const editor = await openEditor("drag-4");
    seed(editor, "aff", [heading("AT: Aff Only")]);
    seed(editor, "neg", [
      cardWith([[{ text: "neg point", marks: hl() }]], { tagline: "Neg claim" }),
    ]);

    const data = buildCardSpeechDragData(editor.state.doc, insideCard(editor));
    // The neg card sits under no neg heading, so its speech carries none - the aff
    // heading that precedes it in document order must not leak in.
    expect(data!.sectionLabel).toBeNull();
    expect(data!.blocks.every((b) => b.type !== "heading")).toBe(true);
  });

  it("does not mutate the block-file document (the drag is a pure read)", async () => {
    const editor = await openEditor("drag-5");
    seed(editor, "aff", [cardWith([[{ text: "hi", marks: hl() }]], { tagline: "t" })]);
    const before = editor.state.doc.toJSON();
    buildCardSpeechDragData(editor.state.doc, insideCard(editor));
    expect(editor.state.doc.toJSON()).toEqual(before);
  });
});

describe("the DataTransfer wire format", () => {
  it("round-trips speech blocks and is detectable during dragover", () => {
    const blocks: JSONContent[] = [
      { type: "paragraph", content: [{ type: "text", text: "hello" }] },
    ];
    const dt = makeDataTransfer();
    writeCardSpeechBlocks(dt, blocks);

    expect(hasCardSpeechDrag(dt)).toBe(true);
    expect(readCardSpeechBlocks(dt)).toEqual(blocks);
    // A plain-text fallback is written for non-rich drop targets.
    expect(dt.getData("text/plain")).toBe("hello");
  });

  it("reports no card drag for an unrelated DataTransfer", () => {
    const dt = makeDataTransfer();
    dt.setData("text/plain", "just text");
    expect(hasCardSpeechDrag(dt)).toBe(false);
    expect(readCardSpeechBlocks(dt)).toBeNull();
    expect(CARD_SPEECH_DRAG_MIME.startsWith("application/")).toBe(true);
  });
});

describe("CardSpeechDrag extension", () => {
  it("renders a draggable handle for each card", async () => {
    const editor = await openEditor("drag-6");
    seed(editor, "aff", [cardWith([[{ text: "a", marks: hl() }]], { tagline: "one" })]);
    seed(editor, "aff", [cardWith([[{ text: "b", marks: hl() }]], { tagline: "two" })]);

    const handles = editor.view.dom.querySelectorAll("[data-card-drag-handle]");
    expect(handles.length).toBe(2);
    for (const h of handles) {
      expect(h.getAttribute("draggable")).toBe("true");
    }
  });
});
