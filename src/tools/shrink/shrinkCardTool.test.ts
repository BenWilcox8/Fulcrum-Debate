/**
 * Behavioral tests for the **Shrink** card-cutting tool.
 *
 * The tool progressively shrinks the un-highlighted (un-read-aloud) body text of
 * the card the caret is in, cycling a configurable font-size sequence and
 * eventually returning to normal, so repeated clicks undo the shrink. Highlighted
 * (spoken) runs are never touched. Follows the established block-file test pattern
 * (`fake-indexeddb/auto` + a fresh `IDBFactory` per test, assertions over the
 * editor API / document marks) - the same setup `formatting/shrink.test.ts` uses.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "../../blockfile/schema";
import { getSideRegion } from "../../blockfile/sections";
import { cardExtensions } from "../../blockfile/card";
import {
  openPreferenceStore,
  type PersistentPreferenceStore,
} from "../../preferences";
import { createCardToolRegistry, toolSectionId } from "../registry";
import {
  shrinkCardTool,
  applyShrink,
  parseShrinkSequence,
  DEFAULT_SHRINK_SEQUENCE,
  SHRINK_TOOL_ID,
} from "./shrinkCardTool";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];
let stores: PersistentPreferenceStore[] = [];

async function openHandle(id: string): Promise<DocumentHandle> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

function openEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
    }),
  });
  editors.push(editor);
  return editor;
}

/**
 * A card whose body holds an un-highlighted head + tail (the runs Shrink drives)
 * and a highlighted middle (the spoken run Shrink must never touch).
 */
function cardWithHighlightedBody(): JSONContent {
  return {
    type: "card",
    content: [
      { type: "cardTag", content: [{ type: "text", text: "T" }] },
      { type: "cardTagline", content: [{ type: "text", text: "Warming is real" }] },
      { type: "cardCite", content: [{ type: "text", text: "Smith 24" }] },
      {
        type: "cardBody",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "intro " },
              { type: "text", text: "read aloud", marks: [{ type: "highlight" }] },
              { type: "text", text: " outro" },
            ],
          },
        ],
      },
    ],
  };
}

/** Insert `content` after the aff side's leading paragraph, cursor into the card body. */
function seedCard(editor: Editor): Editor {
  const aff = getSideRegion(editor, "aff");
  editor
    .chain()
    .insertContentAt(aff.contentEnd, cardWithHighlightedBody(), {
      updateSelection: false,
    })
    .run();
  // Put the caret inside the body so the tool's card lookup resolves.
  const { from } = textRange(editor, "intro ");
  editor.commands.setTextSelection(from + 1);
  return editor;
}

/** The `{ from, to }` range of the run whose text is exactly `text`. */
function textRange(editor: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`textRange: no run "${text}"`);
  return range;
}

/** The `fontSize` on the run whose text is exactly `text`, or null if unset. */
function sizeOf(editor: Editor, text: string): string | null {
  const textStyle = editor.state.schema.marks.textStyle;
  let size: string | null = null;
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    if (node.isText && node.text === text) {
      const mark = node.marks.find((m) => m.type.name === textStyle.name);
      const value = mark?.attrs.fontSize;
      size = typeof value === "string" ? value : null;
      found = true;
      return false;
    }
    return true;
  });
  return size;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  for (const store of stores) store.close();
  editors = [];
  handles = [];
  stores = [];
});

describe("parseShrinkSequence", () => {
  it("splits a comma list, trims, and drops empty tokens", () => {
    expect(parseShrinkSequence("8pt, 7pt ,6pt,")).toEqual(["8pt", "7pt", "6pt"]);
  });

  it("appends pt to a bare numeric token", () => {
    expect(parseShrinkSequence("8, 7, 6")).toEqual(["8pt", "7pt", "6pt"]);
  });

  it("parses the default sequence to 8pt..5pt", () => {
    expect(parseShrinkSequence(DEFAULT_SHRINK_SEQUENCE)).toEqual([
      "8pt",
      "7pt",
      "6pt",
      "5pt",
    ]);
  });
});

describe("shrinkCardTool definition", () => {
  it("declares its id, label, and a configurable size-sequence setting", () => {
    expect(shrinkCardTool.id).toBe(SHRINK_TOOL_ID);
    expect(shrinkCardTool.id).toBe("shrink");
    expect(shrinkCardTool.label).toBe("Shrink");
    expect(shrinkCardTool.settings.sizes.default).toBe(DEFAULT_SHRINK_SEQUENCE);
  });
});

describe("applyShrink", () => {
  it("cycles the un-highlighted body runs through the sequence and back to normal", async () => {
    const editor = seedCard(openEditor(await openHandle("cycle")));
    const sequence = parseShrinkSequence(DEFAULT_SHRINK_SEQUENCE);

    // Un-highlighted head + tail start unsized; the highlighted run too.
    expect(sizeOf(editor, "intro ")).toBeNull();
    expect(sizeOf(editor, " outro")).toBeNull();

    for (const expected of sequence) {
      expect(applyShrink(editor, sequence)).toBe(true);
      expect(sizeOf(editor, "intro ")).toBe(expected);
      expect(sizeOf(editor, " outro")).toBe(expected);
    }

    // One more application after the last step returns to normal (unset).
    expect(applyShrink(editor, sequence)).toBe(true);
    expect(sizeOf(editor, "intro ")).toBeNull();
    expect(sizeOf(editor, " outro")).toBeNull();

    // ...and the cycle restarts from the first size.
    expect(applyShrink(editor, sequence)).toBe(true);
    expect(sizeOf(editor, "intro ")).toBe(sequence[0]);
  });

  it("never touches the highlighted (spoken) run", async () => {
    const editor = seedCard(openEditor(await openHandle("highlight")));
    const sequence = parseShrinkSequence(DEFAULT_SHRINK_SEQUENCE);

    for (let i = 0; i < sequence.length + 2; i++) {
      applyShrink(editor, sequence);
      expect(sizeOf(editor, "read aloud")).toBeNull();
    }
  });

  it("leaves the tag, cite, and tagline regions unshrunk", async () => {
    const editor = seedCard(openEditor(await openHandle("regions")));
    const sequence = parseShrinkSequence(DEFAULT_SHRINK_SEQUENCE);

    applyShrink(editor, sequence);

    expect(sizeOf(editor, "T")).toBeNull();
    expect(sizeOf(editor, "Smith 24")).toBeNull();
    expect(sizeOf(editor, "Warming is real")).toBeNull();
  });

  it("is a no-op when the caret is not in a card", async () => {
    const editor = openEditor(await openHandle("no-card"));
    editor.commands.setTextSelection(1); // aff leading paragraph, not a card
    expect(applyShrink(editor, parseShrinkSequence(DEFAULT_SHRINK_SEQUENCE))).toBe(
      false,
    );
  });
});

describe("shrinkCardTool through the registry", () => {
  it("shrinks by the tool's live, configurable sequence", async () => {
    const store = openPreferenceStore();
    stores.push(store);
    await store.whenLoaded;

    const registry = createCardToolRegistry(store);
    const shrink = registry.register(shrinkCardTool);
    expect(store.getSection(toolSectionId("shrink"))).toBeDefined();

    const editor = seedCard(openEditor(await openHandle("registry")));

    // Reconfigure the sequence through the tool's settings section.
    shrink.settings.set("sizes", "10pt, 9pt");

    expect(shrink.apply(editor)).toBe(true);
    expect(sizeOf(editor, "intro ")).toBe("10pt");

    expect(shrink.apply(editor)).toBe(true);
    expect(sizeOf(editor, "intro ")).toBe("9pt");

    // End of the (two-step) sequence returns to normal.
    expect(shrink.apply(editor)).toBe(true);
    expect(sizeOf(editor, "intro ")).toBeNull();
  });
});
