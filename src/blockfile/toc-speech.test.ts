/**
 * Behavioral tests for the **ToC bulk-send -> Speech Doc** pipeline core.
 *
 * The highest seam of the feature: a set of checked block-file heading positions
 * turns into Auto-Speech-formatted content appended to the bottom of a speech
 * doc's body, the block file left untouched, and the append surviving a
 * close/reopen of the speech doc. These tests drive a real block-file + card
 * editor and a real speech-doc handle over the `fake-indexeddb` harness the other
 * suites use, and assert on the speech body's rendered content + the block file's
 * unchanged content - never on ProseMirror internals.
 *
 * Heading positions that drive the send come from the real outline query
 * ({@link getOutline}), the same seam the ToC checkboxes read.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { getOutline, HEADING_LEVELS } from "../editor/headings";
import { HIGHLIGHT_MARK_NAME } from "../editor/marks";
import { SPEECH_DOC_BODY_FRAGMENT } from "../speech-doc/speech-doc";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  getSideRegion,
  addSection,
  sectionSpeechBlocks,
  sendSectionsToSpeechDoc,
} from ".";

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

async function openBlockFile(id: string): Promise<{ handle: DocumentHandle; editor: Editor }> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
      headingLevels: HEADING_LEVELS,
    }),
  });
  editors.push(editor);
  return { handle, editor };
}

async function openSpeechDoc(id: string): Promise<DocumentHandle> {
  const handle = openDocument({ id, kind: "speech-doc" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

function speechBodyEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: SPEECH_DOC_BODY_FRAGMENT },
    extensions: editorPreset(),
  });
  editors.push(editor);
  return editor;
}

interface Run {
  text: string;
  highlight?: boolean;
}

function cardWith(fields: {
  tagline: string;
  cite: string;
  body: Run[];
}): JSONContent {
  return {
    type: "card",
    content: [
      { type: "cardTag", content: [{ type: "text", text: "T" }] },
      { type: "cardTagline", content: [{ type: "text", text: fields.tagline }] },
      { type: "cardCite", content: [{ type: "text", text: fields.cite }] },
      {
        type: "cardBody",
        content: [
          {
            type: "paragraph",
            content: fields.body.map((run) => ({
              type: "text",
              text: run.text,
              ...(run.highlight
                ? { marks: [{ type: HIGHLIGHT_MARK_NAME }] }
                : {}),
            })),
          },
        ],
      },
    ],
  };
}

/** Append a card at the end of the aff side (after the current last block). */
function appendCard(editor: Editor, card: JSONContent): void {
  const at = getSideRegion(editor, "aff").contentEnd;
  editor.chain().insertContentAt(at, card, { updateSelection: false }).run();
}

/**
 * Builds an aff side with two argument sections:
 *   "Gold" -> two cards, "Fusion" -> one card.
 */
function seedTwoSections(editor: Editor): void {
  addSection(editor, "aff", "Gold");
  appendCard(
    editor,
    cardWith({
      tagline: "Gold solves warming",
      cite: "Smith 24",
      body: [
        { text: "read this aloud", highlight: true },
        { text: " but not this part" },
      ],
    }),
  );
  appendCard(
    editor,
    cardWith({
      tagline: "Gold is cheap",
      cite: "Jones 23",
      body: [{ text: "affordable everywhere", highlight: true }],
    }),
  );
  addSection(editor, "aff", "Fusion");
  appendCard(
    editor,
    cardWith({
      tagline: "Fusion is near",
      cite: "Lee 25",
      body: [{ text: "fusion within a decade", highlight: true }],
    }),
  );
}

/** The document position of the section heading whose text is `label`. */
function headingPos(editor: Editor, label: string): number {
  const heading = getOutline(editor).find((h) => h.text === label);
  if (!heading) throw new Error(`no heading "${label}"`);
  return heading.pos;
}

describe("ToC bulk-send pipeline", () => {
  it("appends the checked sections' cards, Auto-Speech-formatted, to the speech body bottom", async () => {
    const { editor } = await openBlockFile("bf-1");
    seedTwoSections(editor);
    const speech = await openSpeechDoc("sp-1");

    const result = sendSectionsToSpeechDoc(editor, speech, [
      headingPos(editor, "Gold"),
      headingPos(editor, "Fusion"),
    ]);

    expect(result.sectionCount).toBe(2);
    expect(result.blockCount).toBeGreaterThan(0);

    const html = speechBodyEditor(speech).getHTML();
    // Taglines are emitted bold.
    expect(html).toContain("<strong>Gold solves warming</strong>");
    expect(html).toContain("<strong>Fusion is near</strong>");
    // Cites are read aloud.
    expect(html).toContain("Smith 24");
    // Highlighted body runs survive as plain text; un-highlighted body is stripped.
    expect(html).toContain("read this aloud");
    expect(html).not.toContain("but not this part");
    // Section headers are preserved; adjacent cards are separated.
    expect(html).toContain("Gold");
    expect(html).toContain("Fusion");
    expect(html).toContain("---");
  });

  it("sends only the checked sections", async () => {
    const { editor } = await openBlockFile("bf-2");
    seedTwoSections(editor);
    const speech = await openSpeechDoc("sp-2");

    sendSectionsToSpeechDoc(editor, speech, [headingPos(editor, "Gold")]);

    const html = speechBodyEditor(speech).getHTML();
    expect(html).toContain("Gold solves warming");
    expect(html).toContain("Gold is cheap");
    expect(html).not.toContain("Fusion is near");
  });

  it("leaves the block file completely unchanged (non-destructive)", async () => {
    const { editor } = await openBlockFile("bf-3");
    seedTwoSections(editor);
    const before = editor.getHTML();
    const speech = await openSpeechDoc("sp-3");

    sendSectionsToSpeechDoc(editor, speech, [
      headingPos(editor, "Gold"),
      headingPos(editor, "Fusion"),
    ]);

    expect(editor.getHTML()).toBe(before);
  });

  it("persists the appended content across a speech-doc close/reopen", async () => {
    const { editor } = await openBlockFile("bf-4");
    seedTwoSections(editor);

    const speech = await openSpeechDoc("sp-4");
    sendSectionsToSpeechDoc(editor, speech, [headingPos(editor, "Gold")]);
    await speech.close();
    // Drop the closed handle from teardown (reopened below).
    handles = handles.filter((h) => h !== speech);

    const reopened = await openSpeechDoc("sp-4");
    const html = speechBodyEditor(reopened).getHTML();
    expect(html).toContain("<strong>Gold solves warming</strong>");
    expect(html).toContain("read this aloud");
  });

  it("is a no-op when nothing is checked", async () => {
    const { editor } = await openBlockFile("bf-5");
    seedTwoSections(editor);
    const speech = await openSpeechDoc("sp-5");

    const result = sendSectionsToSpeechDoc(editor, speech, []);

    expect(result).toEqual({ sectionCount: 0, blockCount: 0 });
    expect(sectionSpeechBlocks(editor, [])).toEqual([]);
    // An untouched speech body is just its schema-backfilled empty paragraph.
    expect(speechBodyEditor(speech).getText().trim()).toBe("");
  });

  it("skips a checked position that no longer addresses a heading", async () => {
    const { editor } = await openBlockFile("bf-6");
    seedTwoSections(editor);

    // A position inside a card body is not a heading - contributes nothing.
    const stale = getSideRegion(editor, "aff").contentEnd - 2;
    expect(sectionSpeechBlocks(editor, [stale])).toEqual([]);
  });
});
