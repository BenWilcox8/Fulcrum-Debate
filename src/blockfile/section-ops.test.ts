/**
 * Behavioral tests for the block-file section maintenance operations.
 *
 * Follows the established pattern - `fake-indexeddb/auto` + a fresh `IDBFactory`
 * per test, assertions on the query results and document JSON via the editor
 * command API, never ProseMirror internals.
 *
 * The one deliberate exception is the undo test, which reaches for the Yjs
 * `UndoManager` through the collaboration binding's plugin key only to place a
 * clean capture boundary (`stopCapturing`); it still asserts behaviour (the
 * document reverts), never plugin internals.
 */
import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { yUndoPluginKey } from "@tiptap/y-tiptap";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import type { BlockSide } from "./side";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "./schema";
import { getSideRegion } from "./sections";
import { getSideSections } from "./argument-sections";
import {
  addSection,
  renameSection,
  moveSection,
  getSectionRange,
} from "./section-ops";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openEditor(id: string): Promise<Editor> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  editors.push(editor);
  return editor;
}

/** Appends a body paragraph to the bottom of a side (falls under the last section). */
function appendBody(editor: Editor, side: BlockSide, text: string): void {
  const { contentEnd } = getSideRegion(editor, side);
  editor
    .chain()
    .insertContentAt(contentEnd, {
      type: "paragraph",
      content: [{ type: "text", text }],
    })
    .run();
}

/** The plain-text labels of a side's sections, in order. */
function labels(editor: Editor, side: BlockSide): string[] {
  return getSideSections(editor, side).map((s) => s.label);
}

/** Places a clean Yjs undo boundary so the next edits are their own undo step. */
function undoBoundary(editor: Editor): void {
  yUndoPluginKey.getState(editor.state)?.undoManager.stopCapturing();
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  editors = [];
  handles = [];
});

describe("block-file section maintenance", () => {
  describe("addSection", () => {
    it("appends at the end of a side by default", async () => {
      const editor = await openEditor("add-end");
      addSection(editor, "aff", "AT: Gold");
      addSection(editor, "aff", "AT: Fusion");
      expect(labels(editor, "aff")).toEqual(["AT: Gold", "AT: Fusion"]);
    });

    it("inserts at the start of a side", async () => {
      const editor = await openEditor("add-start");
      addSection(editor, "aff", "AT: Gold");
      addSection(editor, "aff", "AT: Wind", "start");
      expect(labels(editor, "aff")).toEqual(["AT: Wind", "AT: Gold"]);
    });

    it("inserts before an existing section", async () => {
      const editor = await openEditor("add-before");
      addSection(editor, "aff", "AT: Gold");
      addSection(editor, "aff", "AT: Wind");
      addSection(editor, "aff", "AT: Fusion", { before: 1 });
      expect(labels(editor, "aff")).toEqual(["AT: Gold", "AT: Fusion", "AT: Wind"]);
    });

    it("inserts after an existing section, past its whole block", async () => {
      const editor = await openEditor("add-after");
      addSection(editor, "aff", "AT: Gold");
      appendBody(editor, "aff", "gold card body");
      addSection(editor, "aff", "AT: Wind");
      // After section 0 (AT: Gold) - must land after its body, before AT: Wind.
      addSection(editor, "aff", "AT: Fusion", { after: 0 });
      expect(labels(editor, "aff")).toEqual(["AT: Gold", "AT: Fusion", "AT: Wind"]);
    });

    it("uses the documented heading JSON schema in the right side", async () => {
      const editor = await openEditor("add-json");
      addSection(editor, "neg", "AT: Solar");
      const negJson = getSideRegion(editor, "neg").node.toJSON();
      expect(negJson.content).toContainEqual({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "AT: Solar" }],
      });
      // The aff side is untouched.
      expect(labels(editor, "aff")).toEqual([]);
    });

    it("throws on a placement referencing a missing section", async () => {
      const editor = await openEditor("add-throw");
      expect(() => addSection(editor, "aff", "AT: X", { before: 0 })).toThrow();
    });
  });

  describe("renameSection", () => {
    it("renames a header and the new label persists in the query", async () => {
      const editor = await openEditor("rename");
      addSection(editor, "aff", "AT: Gold");
      addSection(editor, "aff", "AT: Wind");
      renameSection(editor, "aff", 0, "AT: Gold Standard");
      expect(labels(editor, "aff")).toEqual(["AT: Gold Standard", "AT: Wind"]);
    });

    it("keeps the node a section heading and leaves body content intact", async () => {
      const editor = await openEditor("rename-body");
      addSection(editor, "aff", "AT: Gold");
      appendBody(editor, "aff", "gold card body");
      renameSection(editor, "aff", 0, "AT: Renamed");

      const { pos } = getSideSections(editor, "aff")[0];
      expect(editor.state.doc.nodeAt(pos)?.type.name).toBe("heading");
      expect(editor.state.doc.textContent).toContain("gold card body");
    });

    it("throws on an out-of-range index", async () => {
      const editor = await openEditor("rename-throw");
      expect(() => renameSection(editor, "aff", 0, "X")).toThrow();
    });
  });

  describe("moveSection", () => {
    it("reorders sections within a side", async () => {
      const editor = await openEditor("move-order");
      addSection(editor, "aff", "AT: A");
      addSection(editor, "aff", "AT: B");
      addSection(editor, "aff", "AT: C");
      moveSection(editor, "aff", 2, 0);
      expect(labels(editor, "aff")).toEqual(["AT: C", "AT: A", "AT: B"]);
    });

    it("carries the whole content block - body travels with its header", async () => {
      const editor = await openEditor("move-body");
      addSection(editor, "aff", "AT: Gold");
      appendBody(editor, "aff", "gold body one");
      appendBody(editor, "aff", "gold body two");
      addSection(editor, "aff", "AT: Wind");
      appendBody(editor, "aff", "wind body");

      // Move AT: Gold (with its two body paragraphs) below AT: Wind.
      moveSection(editor, "aff", 0, 1);
      expect(labels(editor, "aff")).toEqual(["AT: Wind", "AT: Gold"]);

      // The AT: Gold block, now second, still owns both of its body paragraphs.
      const goldRange = getSectionRange(editor, "aff", 1);
      const goldText = editor.state.doc.textBetween(
        goldRange.from,
        goldRange.to,
        "\n",
      );
      expect(goldText).toContain("AT: Gold");
      expect(goldText).toContain("gold body one");
      expect(goldText).toContain("gold body two");
      expect(goldText).not.toContain("wind body");
    });

    it("clamps toIndex and is a no-op at the current position", async () => {
      const editor = await openEditor("move-clamp");
      addSection(editor, "aff", "AT: A");
      addSection(editor, "aff", "AT: B");
      moveSection(editor, "aff", 0, 99); // clamps to last
      expect(labels(editor, "aff")).toEqual(["AT: B", "AT: A"]);
      moveSection(editor, "aff", 0, 0); // no-op
      expect(labels(editor, "aff")).toEqual(["AT: B", "AT: A"]);
    });

    it("leaves preamble at the top of the side", async () => {
      const editor = await openEditor("move-preamble");
      // Preamble: paragraph content before any section header (the side also
      // opens with a schema-backfilled empty paragraph, so this is not first).
      appendBody(editor, "aff", "preamble text");
      addSection(editor, "aff", "AT: A");
      addSection(editor, "aff", "AT: B");
      moveSection(editor, "aff", 1, 0);

      // Preamble stays above the first section: every child before the first
      // heading is a paragraph, and the preamble text is among them.
      const region = getSideRegion(editor, "aff");
      const firstHeadingIndex = getSideSections(editor, "aff")[0].pos;
      expect(region.node.firstChild?.type.name).toBe("paragraph");
      // The first section heading is not the first child - preamble precedes it.
      expect(region.node.child(0).type.name).not.toBe("heading");
      expect(region.node.textContent).toContain("preamble text");
      // Sanity: the reorder still happened.
      expect(labels(editor, "aff")).toEqual(["AT: B", "AT: A"]);
      // And "preamble text" sits before the first section heading in the doc.
      expect(editor.state.doc.textBetween(0, firstHeadingIndex, "\n")).toContain(
        "preamble text",
      );
    });

    it("throws on an out-of-range fromIndex", async () => {
      const editor = await openEditor("move-throw");
      addSection(editor, "aff", "AT: A");
      expect(() => moveSection(editor, "aff", 5, 0)).toThrow();
    });
  });

  describe("cross-side integrity", () => {
    it("never moves content across the aff/neg boundary", async () => {
      const editor = await openEditor("cross");
      addSection(editor, "aff", "AT: Aff One");
      addSection(editor, "aff", "AT: Aff Two");
      addSection(editor, "neg", "AT: Neg One");
      addSection(editor, "neg", "AT: Neg Two");

      moveSection(editor, "aff", 0, 1);
      moveSection(editor, "neg", 1, 0);

      expect(labels(editor, "aff")).toEqual(["AT: Aff Two", "AT: Aff One"]);
      expect(labels(editor, "neg")).toEqual(["AT: Neg Two", "AT: Neg One"]);
      // Neither side leaked into the other.
      expect(labels(editor, "aff").every((l) => l.startsWith("AT: Aff"))).toBe(true);
      expect(labels(editor, "neg").every((l) => l.startsWith("AT: Neg"))).toBe(true);
    });

    it("keeps the enforced two-section document shape", async () => {
      const editor = await openEditor("shape");
      addSection(editor, "aff", "AT: A");
      addSection(editor, "neg", "AT: B");
      moveSection(editor, "aff", 0, 0);
      renameSection(editor, "neg", 0, "AT: B2");

      const top = editor.getJSON().content ?? [];
      expect(top.map((n) => n.type)).toEqual(["affSection", "negSection"]);
    });
  });

  it("persists operations across a reload", async () => {
    const first = await openEditor("reload2");
    addSection(first, "aff", "AT: Gold");
    appendBody(first, "aff", "gold body");
    addSection(first, "aff", "AT: Wind");
    addSection(first, "neg", "AT: Solar");
    moveSection(first, "aff", 0, 1); // AT: Gold (with body) below AT: Wind

    // Drop the first editor/handle so the second reads persisted state.
    first.destroy();
    editors = editors.filter((e) => e !== first);
    const firstHandle = handles.find((h) => h.id === "reload2");
    if (firstHandle) {
      await firstHandle.close();
      handles = handles.filter((h) => h !== firstHandle);
    }

    const second = await openEditor("reload2");
    expect(labels(second, "aff")).toEqual(["AT: Wind", "AT: Gold"]);
    expect(labels(second, "neg")).toEqual(["AT: Solar"]);
    // The moved body travelled and persisted.
    const goldRange = getSectionRange(second, "aff", 1);
    expect(
      second.state.doc.textBetween(goldRange.from, goldRange.to, "\n"),
    ).toContain("gold body");
  });

  describe("undo (Yjs history)", () => {
    it("undoes a reorder, restoring the original order and content", async () => {
      const editor = await openEditor("undo-move");
      addSection(editor, "aff", "AT: Gold");
      appendBody(editor, "aff", "gold body");
      addSection(editor, "aff", "AT: Wind");
      undoBoundary(editor); // setup is its own undo step

      moveSection(editor, "aff", 0, 1);
      expect(labels(editor, "aff")).toEqual(["AT: Wind", "AT: Gold"]);

      editor.commands.undo();
      expect(labels(editor, "aff")).toEqual(["AT: Gold", "AT: Wind"]);
      // The body is back under AT: Gold at the top.
      const goldRange = getSectionRange(editor, "aff", 0);
      expect(
        editor.state.doc.textBetween(goldRange.from, goldRange.to, "\n"),
      ).toContain("gold body");
    });

    it("undoes a rename", async () => {
      const editor = await openEditor("undo-rename");
      addSection(editor, "aff", "AT: Gold");
      undoBoundary(editor);

      renameSection(editor, "aff", 0, "AT: Renamed");
      expect(labels(editor, "aff")).toEqual(["AT: Renamed"]);

      editor.commands.undo();
      expect(labels(editor, "aff")).toEqual(["AT: Gold"]);
    });
  });
});
