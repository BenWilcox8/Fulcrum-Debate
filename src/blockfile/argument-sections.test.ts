/**
 * Behavioral tests for the block-file argument-section query.
 *
 * Follows the established pattern - `fake-indexeddb/auto` + a fresh `IDBFactory`
 * per test, assertions on the query results and document JSON via the editor
 * command API, never ProseMirror internals.
 */
import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import type { BlockSide } from "./side";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "./schema";
import { getSideRegion } from "./sections";
import {
  BLOCK_SECTION_HEADING_LEVEL,
  getSideSections,
  observeSideSections,
  sideSectionsFromDoc,
  type BlockSection,
} from "./argument-sections";

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

/**
 * Adds an argument-type section header to the bottom of a side via the editor
 * command API - the gesture a real "new argument" control drives.
 */
function addSection(editor: Editor, side: BlockSide, label: string): void {
  const { contentEnd } = getSideRegion(editor, side);
  editor
    .chain()
    .insertContentAt(contentEnd, {
      type: "heading",
      attrs: { level: BLOCK_SECTION_HEADING_LEVEL },
      content: [{ type: "text", text: label }],
    })
    .run();
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

describe("block-file argument-section query", () => {
  it("creates a section header inside a side and lists it", async () => {
    const editor = await openEditor("create");
    addSection(editor, "aff", "AT: Gold");

    const sections = getSideSections(editor, "aff");
    expect(sections).toHaveLength(1);
    expect(sections[0].side).toBe("aff");
    expect(sections[0].label).toBe("AT: Gold");
    expect(sections[0].level).toBe(BLOCK_SECTION_HEADING_LEVEL);
    // pos + 1 selects into the heading.
    expect(editor.state.doc.resolve(sections[0].pos + 1).parent.type.name).toBe(
      "heading",
    );
  });

  it("lands the header in the correct side with the documented JSON schema", async () => {
    const editor = await openEditor("json");
    addSection(editor, "aff", "AT: Gold");

    // The heading appears in the aff region's content with the heading schema.
    const affJson = getSideRegion(editor, "aff").node.toJSON();
    expect(affJson.content).toContainEqual({
      type: "heading",
      attrs: { level: BLOCK_SECTION_HEADING_LEVEL },
      content: [{ type: "text", text: "AT: Gold" }],
    });
  });

  it("returns sections in document order", async () => {
    const editor = await openEditor("order");
    addSection(editor, "aff", "AT: Gold");
    addSection(editor, "aff", "AT: Fusion");
    addSection(editor, "aff", "AT: Wind");

    expect(getSideSections(editor, "aff").map((s) => s.label)).toEqual([
      "AT: Gold",
      "AT: Fusion",
      "AT: Wind",
    ]);
    // Positions are strictly ascending in document order.
    const positions = getSideSections(editor, "aff").map((s) => s.pos);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("scopes sections to one side - the other side never leaks in", async () => {
    const editor = await openEditor("scope");
    addSection(editor, "aff", "AT: Gold");
    addSection(editor, "neg", "AT: Solar");
    addSection(editor, "neg", "AT: Nuclear");

    expect(getSideSections(editor, "aff").map((s) => s.label)).toEqual([
      "AT: Gold",
    ]);
    expect(getSideSections(editor, "neg").map((s) => s.label)).toEqual([
      "AT: Solar",
      "AT: Nuclear",
    ]);
    expect(getSideSections(editor, "aff").every((s) => s.side === "aff")).toBe(
      true,
    );
  });

  it("only counts direct-child section headings, not deeper nested headings", async () => {
    const editor = await openEditor("depth");
    addSection(editor, "aff", "AT: Gold");
    // A deeper heading (a subpoint under the argument) is not a new section.
    const { contentEnd } = getSideRegion(editor, "aff");
    editor
      .chain()
      .insertContentAt(contentEnd, {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Subpoint" }],
      })
      .run();

    const sections = getSideSections(editor, "aff");
    expect(sections.map((s) => s.label)).toEqual(["AT: Gold"]);
  });

  it("reflects live document changes: add, rename, remove", async () => {
    const editor = await openEditor("live");
    const snapshots: BlockSection[][] = [];
    const stop = observeSideSections(editor, "aff", (sections) => {
      snapshots.push(sections);
    });

    // Immediate fire: no sections yet.
    expect(snapshots.at(-1)).toEqual([]);

    // Add.
    addSection(editor, "aff", "AT: Gold");
    expect(snapshots.at(-1)?.map((s) => s.label)).toEqual(["AT: Gold"]);

    // Rename: select into the header and rewrite its text.
    const { pos } = getSideSections(editor, "aff")[0];
    editor
      .chain()
      .setTextSelection({ from: pos + 1, to: pos + 1 + "AT: Gold".length })
      .insertContent("AT: Fusion")
      .run();
    expect(snapshots.at(-1)?.map((s) => s.label)).toEqual(["AT: Fusion"]);

    // Remove: turn the header back into a paragraph.
    const renamed = getSideSections(editor, "aff")[0];
    editor
      .chain()
      .setTextSelection(renamed.pos + 1)
      .setParagraph()
      .run();
    expect(snapshots.at(-1)).toEqual([]);

    stop();
  });

  it("does not re-fire on selection-only changes", async () => {
    const editor = await openEditor("selection");
    addSection(editor, "aff", "AT: Gold");

    let calls = 0;
    const stop = observeSideSections(editor, "aff", () => {
      calls += 1;
    });
    expect(calls).toBe(1); // immediate

    const { contentStart } = getSideRegion(editor, "aff");
    editor.chain().setTextSelection(contentStart).run();
    expect(calls).toBe(1); // selection-only: no re-fire

    stop();
  });

  it("stops firing after unsubscribe", async () => {
    const editor = await openEditor("unsub");
    let calls = 0;
    const stop = observeSideSections(editor, "aff", () => {
      calls += 1;
    });
    expect(calls).toBe(1);
    stop();
    addSection(editor, "aff", "AT: Gold");
    expect(calls).toBe(1);
  });

  it("survives a reload through a fresh handle + editor", async () => {
    const first = await openEditor("reload");
    addSection(first, "aff", "AT: Gold");
    addSection(first, "neg", "AT: Solar");
    // Close the first handle/editor so the second reads persisted state.
    first.destroy();
    editors = editors.filter((e) => e !== first);
    const firstHandle = handles.find((h) => h.id === "reload");
    if (firstHandle) {
      await firstHandle.close();
      handles = handles.filter((h) => h !== firstHandle);
    }

    const second = await openEditor("reload");
    expect(getSideSections(second, "aff").map((s) => s.label)).toEqual([
      "AT: Gold",
    ]);
    expect(getSideSections(second, "neg").map((s) => s.label)).toEqual([
      "AT: Solar",
    ]);
  });

  it("sideSectionsFromDoc works on a doc parsed from persisted JSON", async () => {
    const editor = await openEditor("from-json");
    addSection(editor, "aff", "AT: Gold");
    const doc = ProseMirrorNode.fromJSON(editor.schema, editor.getJSON());

    expect(sideSectionsFromDoc(doc, "aff").map((s) => s.label)).toEqual([
      "AT: Gold",
    ]);
    expect(sideSectionsFromDoc(doc, "neg")).toEqual([]);
  });
});
