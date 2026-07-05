/**
 * Behavioral tests for the block-file schema: the enforced two-region structure,
 * its survival of hostile ordinary editing, and persistence through the document
 * layer.
 *
 * Follows the established pattern - `fake-indexeddb/auto` + a fresh `IDBFactory`
 * per test, assertions on the editor API / document JSON, never ProseMirror
 * plugin internals or pixels.
 */
import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  BLOCK_FILE_FRAGMENT,
  AFF_SECTION_NODE_NAME,
  NEG_SECTION_NODE_NAME,
  blockFileExtensions,
} from "./schema";
import { getSideRegion } from "./sections";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openHandle(id: string): Promise<DocumentHandle> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

/** Build a block-file editor through the shared preset's feature-extension seam. */
function openEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  editors.push(editor);
  return editor;
}

/** The top-level child node types, in order. */
function topLevelTypes(editor: Editor): string[] {
  return (editor.getJSON().content ?? []).map((n) => n.type as string);
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

describe("block-file schema", () => {
  it("enforces exactly one aff region then one neg region on a fresh document", async () => {
    const editor = openEditor(await openHandle("fresh"));

    expect(topLevelTypes(editor)).toEqual([
      AFF_SECTION_NODE_NAME,
      NEG_SECTION_NODE_NAME,
    ]);
    // Each region auto-fills an empty paragraph so the document is immediately
    // editable on both sides.
    const json = editor.getJSON();
    expect(json.content).toHaveLength(2);
    for (const section of json.content ?? []) {
      expect(section.content).toEqual([{ type: "paragraph" }]);
    }
  });

  it("serializes each region to a data-side section element", async () => {
    const editor = openEditor(await openHandle("html"));
    const html = editor.getHTML();
    expect(html).toContain('data-side="aff"');
    expect(html).toContain('data-side="neg"');
  });

  it("keeps side content separated by region", async () => {
    const editor = openEditor(await openHandle("separated"));

    editor
      .chain()
      .insertContentAt(getSideRegion(editor, "aff").contentStart, "aff evidence")
      .run();
    editor
      .chain()
      .insertContentAt(getSideRegion(editor, "neg").contentStart, "neg evidence")
      .run();

    expect(getSideRegion(editor, "aff").node.textContent).toBe("aff evidence");
    expect(getSideRegion(editor, "neg").node.textContent).toBe("neg evidence");
  });

  describe("survives hostile ordinary editing", () => {
    it("select-all + delete leaves both regions intact", async () => {
      const editor = openEditor(await openHandle("select-all"));
      editor
        .chain()
        .insertContentAt(getSideRegion(editor, "aff").contentStart, "aff text")
        .run();
      editor
        .chain()
        .insertContentAt(getSideRegion(editor, "neg").contentStart, "neg text")
        .run();

      editor.chain().selectAll().deleteSelection().run();

      expect(topLevelTypes(editor)).toEqual([
        AFF_SECTION_NODE_NAME,
        NEG_SECTION_NODE_NAME,
      ]);
      // Both sides survive, emptied back to a single empty paragraph.
      expect(getSideRegion(editor, "aff").node.textContent).toBe("");
      expect(getSideRegion(editor, "neg").node.textContent).toBe("");
    });

    it("deleting across the aff/neg boundary does not merge the regions", async () => {
      const editor = openEditor(await openHandle("cross-boundary"));
      editor
        .chain()
        .insertContentAt(getSideRegion(editor, "aff").contentStart, "aff text")
        .run();
      editor
        .chain()
        .insertContentAt(getSideRegion(editor, "neg").contentStart, "neg text")
        .run();

      // Select a range spanning from inside the aff content through inside the
      // neg content, and delete it - the classic "merge two sections" gesture.
      const aff = getSideRegion(editor, "aff");
      const neg = getSideRegion(editor, "neg");
      editor
        .chain()
        .setTextSelection({
          from: aff.contentStart + 1 + 4, // after "aff "
          to: neg.contentStart + 1 + 4, // after "neg "
        })
        .deleteSelection()
        .run();

      // Still two isolated regions, still aff-then-neg.
      expect(topLevelTypes(editor)).toEqual([
        AFF_SECTION_NODE_NAME,
        NEG_SECTION_NODE_NAME,
      ]);
      // The regions did not merge: the isolating boundary keeps the aff content
      // wholly in the aff region rather than letting the delete join the two
      // sides into one.
      expect(getSideRegion(editor, "aff").node.textContent).toBe("aff text");
    });

    it("replacing the entire document range keeps both regions", async () => {
      const editor = openEditor(await openHandle("replace-all"));
      // A raw delete of the whole document - stronger than selectAll, it targets
      // every position including the section boundaries.
      const { state, view } = editor;
      view.dispatch(state.tr.delete(0, state.doc.content.size));

      expect(topLevelTypes(editor)).toEqual([
        AFF_SECTION_NODE_NAME,
        NEG_SECTION_NODE_NAME,
      ]);
    });
  });

  it("persists and reloads the two-region structure and per-side content", async () => {
    const h1 = await openHandle("roundtrip");
    const e1 = openEditor(h1);
    e1
      .chain()
      .insertContentAt(getSideRegion(e1, "aff").contentStart, "aff card")
      .run();
    e1
      .chain()
      .insertContentAt(getSideRegion(e1, "neg").contentStart, "neg card")
      .run();
    e1.destroy();
    editors = editors.filter((e) => e !== e1);
    await h1.close();
    handles = handles.filter((h) => h !== h1);

    // A genuinely fresh handle + editor over the same IndexedDB backend.
    const h2 = await openHandle("roundtrip");
    const e2 = openEditor(h2);

    expect(topLevelTypes(e2)).toEqual([
      AFF_SECTION_NODE_NAME,
      NEG_SECTION_NODE_NAME,
    ]);
    expect(getSideRegion(e2, "aff").node.textContent).toBe("aff card");
    expect(getSideRegion(e2, "neg").node.textContent).toBe("neg card");
  });

  it("composes with the shared preset marks and headings", async () => {
    const editor = openEditor(await openHandle("preset"));
    // A preset mark (bold) and node (heading) apply inside a region.
    const aff = getSideRegion(editor, "aff");
    editor
      .chain()
      .insertContentAt(aff.contentStart, "tag")
      .setTextSelection({ from: aff.contentStart, to: aff.contentStart + 3 })
      .setHeading({ level: 2 })
      .setBold()
      .run();

    const affJson = getSideRegion(editor, "aff").node.toJSON();
    expect(affJson.content[0].type).toBe("heading");
    expect(affJson.content[0].attrs.level).toBe(2);
    expect(affJson.content[0].content[0].marks).toEqual([{ type: "bold" }]);
  });

  it("logs the expected intentional duplicate `doc` override warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    openEditor(await openHandle("warn"));
    expect(
      warn.mock.calls.some((args) =>
        args.some(
          (a) => typeof a === "string" && a.includes("Duplicate extension names"),
        ),
      ),
    ).toBe(true);
    warn.mockRestore();
  });
});
