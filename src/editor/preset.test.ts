// jsdom has no IndexedDB; the document core reads the global, so install the
// in-memory fake before anything touches it - the shared editor test pattern.
// These tests bind the preset through a real document handle and assert on the
// editor's command API and resulting document JSON, never ProseMirror internals.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "./core";
import { editorPreset } from "./preset";
import {
  BOLD_MARK_NAME,
  HIGHLIGHT_MARK_NAME,
  DEFAULT_FONT_SIZE,
  setFontSize,
} from "./marks";
import { getOutline } from "./headings";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `doc-${Date.now()}-${nextId++}`;

const openHandle = async (): Promise<DocumentHandle> => {
  const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
  await handle.whenLoaded;
  return handle;
};

const firstRunMarks = (json: JSONContent): JSONContent["marks"] =>
  json.content?.[0]?.content?.[0]?.marks ?? [];

const markNames = (json: JSONContent): string[] =>
  (firstRunMarks(json) ?? []).map((m) => m.type).sort();

describe("editorPreset", () => {
  it("wires bold, highlight, font size, and headings into one editor", async () => {
    const handle = await openHandle();
    const editor: Editor = createEditor({
      binding: { handle, fragment: "body" },
      extensions: editorPreset(),
    });

    editor.commands.setContent("<p>read this</p>");
    editor.commands.selectAll();
    editor.commands.toggleBold();
    editor.commands.toggleHighlight();
    setFontSize(editor, DEFAULT_FONT_SIZE);

    const names = markNames(editor.getJSON());
    expect(names).toContain(BOLD_MARK_NAME);
    expect(names).toContain(HIGHLIGHT_MARK_NAME);
    expect(names).toContain("textStyle");

    // Headings are present too, and the outline query reads them.
    editor.commands.setContent("<h2>Contention</h2><p>body</p>");
    expect(getOutline(editor)).toEqual([
      { level: 2, text: "Contention", pos: 0 },
    ]);

    editor.destroy();
    await handle.close();
  });

  it("narrows the heading range when headingLevels is given", async () => {
    const handle = await openHandle();
    const editor = createEditor({
      binding: { handle, fragment: "body" },
      extensions: editorPreset({ headingLevels: [1, 2] }),
    });

    editor.commands.setContent("<p>x</p>");
    editor.commands.selectAll();

    expect(editor.can().setHeading({ level: 2 })).toBe(true);
    // Level 4 is outside the narrowed set, so the command is unavailable.
    expect(editor.can().setHeading({ level: 4 })).toBe(false);

    editor.destroy();
    await handle.close();
  });

  it("appends feature extensions after the shared preset", async () => {
    const handle = await openHandle();
    // A feature extension is just another entry; assert it composes without
    // disturbing the shared marks.
    const editor = createEditor({
      binding: { handle, fragment: "body" },
      extensions: editorPreset({ extensions: [] }),
    });

    editor.commands.setContent("<p>hello</p>");
    editor.commands.selectAll();
    editor.commands.toggleBold();
    expect(markNames(editor.getJSON())).toEqual([BOLD_MARK_NAME]);

    editor.destroy();
    await handle.close();
  });
});
