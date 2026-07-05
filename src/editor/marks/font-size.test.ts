// jsdom has no IndexedDB; install the in-memory fake before the document core
// reads the global. Tiptap needs only the jsdom DOM the vitest env provides.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument } from "../../documents/core";
import { createEditor } from "../core";
import {
  FONT_SIZE_SCALE,
  DEFAULT_FONT_SIZE,
  UNSET_FONT_SIZE,
  fontSizeExtensions,
  setFontSize,
  unsetFontSize,
  readFontSizes,
  stepFontSizes,
  increaseFontSize,
  decreaseFontSize,
  cycleFontSize,
} from "./font-size";

/**
 * Behavioral tests only: they assert on the editor's public API, on the helpers'
 * return values, and on the resulting document JSON (where a size must surface as
 * an addressable `textStyle` mark). No ProseMirror plugin internals.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `doc-${Date.now()}-${nextId++}`;

/** Opens a document + a font-size-enabled editor bound to its `body` fragment. */
async function openEditor(): Promise<{
  editor: Editor;
  close: () => Promise<void>;
}> {
  const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: "body" },
    extensions: fontSizeExtensions,
  });
  return {
    editor,
    close: async () => {
      editor.destroy();
      await handle.close();
    },
  };
}

/** Selects the whole document body. */
const selectAll = (editor: Editor) => editor.commands.selectAll();

/** Selects a character range (1-based ProseMirror positions). */
const selectRange = (editor: Editor, from: number, to: number) =>
  editor.commands.setTextSelection({ from, to });

/** Collects every `textStyle` fontSize attr in the document JSON, in order. */
const fontSizeMarks = (json: JSONContent): (string | undefined)[] => {
  const out: (string | undefined)[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "text") {
      const mark = (node.marks ?? []).find((m) => m.type === "textStyle");
      out.push(mark?.attrs?.fontSize as string | undefined);
    }
    (node.content ?? []).forEach(walk);
  };
  walk(json);
  return out;
};

describe("setFontSize", () => {
  it("writes an addressable textStyle mark into the document JSON", async () => {
    const { editor, close } = await openEditor();

    editor.commands.setContent("<p>tag</p>");
    selectAll(editor);
    expect(setFontSize(editor, "14pt")).toBe(true);

    // The size is document data - a textStyle mark with a fontSize attr - not a
    // bare inline style the formatting tools would have to scrape.
    expect(fontSizeMarks(editor.getJSON())).toEqual(["14pt"]);

    await close();
  });

  it("persists and reloads the mark through a fresh handle", async () => {
    const id = uniqueId();

    const first = openDocument({ id, kind: "speech-doc" });
    await first.whenLoaded;
    const firstEditor = createEditor({
      binding: { handle: first, fragment: "body" },
      extensions: fontSizeExtensions,
    });
    firstEditor.commands.setContent("<p>evidence</p>");
    firstEditor.commands.selectAll();
    setFontSize(firstEditor, "8pt");
    firstEditor.destroy();
    await first.close();

    const second = openDocument({ id, kind: "speech-doc" });
    await second.whenLoaded;
    const secondEditor = createEditor({
      binding: { handle: second, fragment: "body" },
      extensions: fontSizeExtensions,
    });

    expect(fontSizeMarks(secondEditor.getJSON())).toEqual(["8pt"]);

    secondEditor.destroy();
    await second.close();
  });

  it("unsetFontSize clears the mark back to the default", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>tag</p>");
    selectAll(editor);
    setFontSize(editor, "14pt");
    expect(fontSizeMarks(editor.getJSON())).toEqual(["14pt"]);

    selectAll(editor);
    expect(unsetFontSize(editor)).toBe(true);
    // No fontSize attr survives; the run reads as unset again.
    expect(fontSizeMarks(editor.getJSON())).toEqual([undefined]);
    selectAll(editor);
    expect(readFontSizes(editor)).toEqual([UNSET_FONT_SIZE]);

    await close();
  });

  it("rejects a size that is not on the scale", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>x</p>");
    selectAll(editor);

    // @ts-expect-error - off-scale value is a compile error and a runtime throw.
    expect(() => setFontSize(editor, "13.5px")).toThrow(/FONT_SIZE_SCALE/);

    await close();
  });
});

describe("readFontSizes", () => {
  it("reports the unset default for text with no size mark", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>plain</p>");
    selectAll(editor);

    expect(readFontSizes(editor)).toEqual([UNSET_FONT_SIZE]);

    await close();
  });

  it("reports a single size for a uniform selection", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>uniform</p>");
    selectAll(editor);
    setFontSize(editor, "12pt");

    selectAll(editor);
    expect(readFontSizes(editor)).toEqual(["12pt"]);

    await close();
  });

  it("reports every distinct size in a mixed selection, smallest first", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>abcdef</p>");

    // "abc" -> 12pt, "def" -> 8pt; positions are 1-based, doc starts at 1.
    selectRange(editor, 1, 4);
    setFontSize(editor, "12pt");
    selectRange(editor, 4, 7);
    setFontSize(editor, "8pt");

    selectAll(editor);
    expect(readFontSizes(editor)).toEqual(["8pt", "12pt"]);

    await close();
  });

  it("puts the unset default first when a selection mixes sized and unsized runs", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>abcdef</p>");

    // Size only the tail; the head stays unset/default.
    selectRange(editor, 4, 7);
    setFontSize(editor, "14pt");

    selectAll(editor);
    expect(readFontSizes(editor)).toEqual([UNSET_FONT_SIZE, "14pt"]);

    await close();
  });

  it("reads the size at a collapsed cursor via its stored mark", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>x</p>");

    // Collapse to the end and set a stored mark; typed text would take this size.
    editor.commands.focus("end");
    setFontSize(editor, "9pt");
    expect(editor.state.selection.empty).toBe(true);

    expect(readFontSizes(editor)).toEqual(["9pt"]);

    await close();
  });
});

describe("stepFontSizes", () => {
  it("increases and decreases a uniform selection through the scale", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>step me</p>");
    selectAll(editor);
    setFontSize(editor, "10pt");

    selectAll(editor);
    expect(increaseFontSize(editor)).toBe(true);
    selectAll(editor);
    expect(readFontSizes(editor)).toEqual(["11pt"]);

    selectAll(editor);
    decreaseFontSize(editor);
    selectAll(editor);
    expect(readFontSizes(editor)).toEqual(["10pt"]);

    await close();
  });

  it("anchors an unset run at the default size before stepping", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>default</p>");

    selectAll(editor);
    increaseFontSize(editor);

    // DEFAULT_FONT_SIZE stepped up once.
    const defaultIndex = FONT_SIZE_SCALE.indexOf(DEFAULT_FONT_SIZE);
    selectAll(editor);
    expect(readFontSizes(editor)).toEqual([FONT_SIZE_SCALE[defaultIndex + 1]]);

    await close();
  });

  it("clamps at the top and bottom of the scale by default", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>edge</p>");
    selectAll(editor);
    setFontSize(editor, FONT_SIZE_SCALE[FONT_SIZE_SCALE.length - 1]);

    // Already largest: increase clamps (no change), reports false.
    selectAll(editor);
    expect(increaseFontSize(editor)).toBe(false);
    selectAll(editor);
    expect(readFontSizes(editor)).toEqual([
      FONT_SIZE_SCALE[FONT_SIZE_SCALE.length - 1],
    ]);

    // Drop to the smallest, then decrease clamps.
    selectAll(editor);
    setFontSize(editor, FONT_SIZE_SCALE[0]);
    selectAll(editor);
    expect(decreaseFontSize(editor)).toBe(false);
    selectAll(editor);
    expect(readFontSizes(editor)).toEqual([FONT_SIZE_SCALE[0]]);

    await close();
  });

  it("cycles the largest size back to the smallest", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>wrap</p>");
    selectAll(editor);
    setFontSize(editor, FONT_SIZE_SCALE[FONT_SIZE_SCALE.length - 1]);

    selectAll(editor);
    expect(cycleFontSize(editor)).toBe(true);
    selectAll(editor);
    expect(readFontSizes(editor)).toEqual([FONT_SIZE_SCALE[0]]);

    await close();
  });

  it("steps each run of a mixed selection independently, preserving tiers", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>abcdef</p>");

    // Two tiers: "abc" large (12pt), "def" small (9pt).
    selectRange(editor, 1, 4);
    setFontSize(editor, "12pt");
    selectRange(editor, 4, 7);
    setFontSize(editor, "9pt");

    // Shrink the whole selection one step: each run moves down independently.
    selectAll(editor);
    increaseFontSize(editor); // sanity: grow first
    selectAll(editor);
    expect(readFontSizes(editor)).toEqual(["10pt", "14pt"]);

    selectAll(editor);
    decreaseFontSize(editor);
    selectAll(editor);
    // Back to the original tiers - relative order preserved throughout.
    expect(readFontSizes(editor)).toEqual(["9pt", "12pt"]);
    // And the runs are still distinct marks in the JSON: two text nodes, each
    // carrying its own addressable size (adjacent same-size chars merge to one).
    expect(fontSizeMarks(editor.getJSON())).toEqual(["12pt", "9pt"]);

    await close();
  });

  it("steps a collapsed cursor's stored mark", async () => {
    const { editor, close } = await openEditor();
    editor.commands.setContent("<p>y</p>");
    editor.commands.focus("end");
    setFontSize(editor, "10pt");

    stepFontSizes(editor, "increase");
    expect(editor.state.selection.empty).toBe(true);
    expect(readFontSizes(editor)).toEqual(["11pt"]);

    await close();
  });
});
