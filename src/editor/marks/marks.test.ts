// jsdom has no IndexedDB; the document core reads the global, so install the
// in-memory fake before anything touches it. These tests bind through a real
// document handle (matching the editor-core test pattern) but assert only on the
// editor's public command API and the resulting document JSON - never on
// ProseMirror mark/plugin internals.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../core";
import {
  BoldMark,
  BOLD_MARK_NAME,
  HighlightMark,
  HIGHLIGHT_MARK_NAME,
} from "./index";

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `doc-${Date.now()}-${nextId++}`;

/** Opens a loaded handle and a mark-equipped editor over its `body` fragment. */
const openHandleAndEditor = async (): Promise<{
  handle: DocumentHandle;
  editor: Editor;
}> => {
  const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: "body" },
    extensions: [BoldMark, HighlightMark],
  });
  return { handle, editor };
};

/**
 * The `marks` array (as `{ type }` names) on the first text leaf of the
 * document's first block - the run these tests apply marks to.
 */
const firstRunMarkNames = (json: JSONContent): string[] => {
  const leaf = json.content?.[0]?.content?.[0];
  return (leaf?.marks ?? []).map((mark) => mark.type).sort();
};

describe("bold mark", () => {
  it("applies and removes on a selection via the command API", async () => {
    const { handle, editor } = await openHandleAndEditor();

    editor.commands.setContent("<p>read this</p>");
    editor.commands.selectAll();

    editor.commands.toggleBold();
    expect(firstRunMarkNames(editor.getJSON())).toEqual([BOLD_MARK_NAME]);

    editor.commands.toggleBold();
    expect(firstRunMarkNames(editor.getJSON())).toEqual([]);

    editor.destroy();
    await handle.close();
  });

  it("renders as <strong>", async () => {
    const { handle, editor } = await openHandleAndEditor();

    editor.commands.setContent("<p>tag test</p>");
    editor.commands.selectAll();
    editor.commands.setBold();

    expect(editor.getHTML()).toContain("<strong>");

    editor.destroy();
    await handle.close();
  });
});

describe("highlight mark", () => {
  it("applies and removes on a selection via the command API", async () => {
    const { handle, editor } = await openHandleAndEditor();

    editor.commands.setContent("<p>read this aloud</p>");
    editor.commands.selectAll();

    editor.commands.toggleHighlight();
    expect(firstRunMarkNames(editor.getJSON())).toEqual([HIGHLIGHT_MARK_NAME]);

    editor.commands.toggleHighlight();
    expect(firstRunMarkNames(editor.getJSON())).toEqual([]);

    editor.destroy();
    await handle.close();
  });

  it("renders as <mark> with no color attribute (single-color schema)", async () => {
    const { handle, editor } = await openHandleAndEditor();

    editor.commands.setContent("<p>aloud</p>");
    editor.commands.selectAll();
    editor.commands.setHighlight();

    const html = editor.getHTML();
    expect(html).toContain("<mark");
    expect(html).not.toContain("data-color");

    // The highlight run carries no attributes in the document JSON.
    const leaf = editor.getJSON().content?.[0]?.content?.[0];
    const highlightMark = leaf?.marks?.find(
      (m) => m.type === HIGHLIGHT_MARK_NAME,
    );
    expect(highlightMark?.attrs ?? null).toBeNull();

    editor.destroy();
    await handle.close();
  });
});

describe("bold and highlight independence + composition", () => {
  it("compose on the same run, showing both marks in the JSON", async () => {
    const { handle, editor } = await openHandleAndEditor();

    editor.commands.setContent("<p>both</p>");
    editor.commands.selectAll();
    editor.commands.setBold();
    editor.commands.setHighlight();

    expect(firstRunMarkNames(editor.getJSON())).toEqual(
      [BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME].sort(),
    );

    editor.destroy();
    await handle.close();
  });

  it("toggle independently - removing one leaves the other", async () => {
    const { handle, editor } = await openHandleAndEditor();

    editor.commands.setContent("<p>both</p>");
    editor.commands.selectAll();
    editor.commands.setBold();
    editor.commands.setHighlight();

    // Drop bold; highlight must survive untouched.
    editor.commands.unsetBold();
    expect(firstRunMarkNames(editor.getJSON())).toEqual([HIGHLIGHT_MARK_NAME]);

    // Drop highlight; nothing remains.
    editor.commands.unsetHighlight();
    expect(firstRunMarkNames(editor.getJSON())).toEqual([]);

    editor.destroy();
    await handle.close();
  });

  it("persist and reload together through a fresh handle + editor", async () => {
    const id = uniqueId();

    const first = openDocument({ id, kind: "speech-doc" });
    await first.whenLoaded;
    const firstEditor = createEditor({
      binding: { handle: first, fragment: "body" },
      extensions: [BoldMark, HighlightMark],
    });
    firstEditor.commands.setContent("<p>read aloud</p>");
    firstEditor.commands.selectAll();
    firstEditor.commands.setBold();
    firstEditor.commands.setHighlight();
    firstEditor.destroy();
    await first.close();

    // A genuinely separate handle + editor reads the marked run back out.
    const second = openDocument({ id, kind: "speech-doc" });
    await second.whenLoaded;
    const secondEditor = createEditor({
      binding: { handle: second, fragment: "body" },
      extensions: [BoldMark, HighlightMark],
    });

    expect(firstRunMarkNames(secondEditor.getJSON())).toEqual(
      [BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME].sort(),
    );

    secondEditor.destroy();
    await second.close();
  });
});
