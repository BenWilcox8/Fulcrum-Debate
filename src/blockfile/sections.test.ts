/**
 * Behavioral tests for the block-file addressing helpers.
 *
 * Follows the established pattern - `fake-indexeddb/auto` + a fresh `IDBFactory`
 * per test, assertions on the helper results and document JSON.
 */
import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "./schema";
import {
  getSideRegion,
  getSideRegions,
  sideRegionsFromDoc,
  focusSide,
} from "./sections";

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

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  editors = [];
  handles = [];
});

describe("block-file addressing helpers", () => {
  it("addresses both regions, aff before neg", async () => {
    const editor = await openEditor("regions");
    const regions = getSideRegions(editor);

    expect(regions.aff.side).toBe("aff");
    expect(regions.neg.side).toBe("neg");
    // Aff comes first in document order.
    expect(regions.aff.pos).toBeLessThan(regions.neg.pos);
    // contentStart is one past the section's own position.
    expect(regions.aff.contentStart).toBe(regions.aff.pos + 1);
    expect(regions.neg.contentStart).toBe(regions.neg.pos + 1);
    // Content range brackets the section's content.
    expect(regions.aff.contentEnd).toBe(
      regions.aff.contentStart + regions.aff.node.content.size,
    );
  });

  it("contentStart addresses the top of a side's content for insertion", async () => {
    const editor = await openEditor("insert");
    editor
      .chain()
      .insertContentAt(getSideRegion(editor, "neg").contentStart, "first neg card")
      .run();

    expect(getSideRegion(editor, "neg").node.textContent).toBe("first neg card");
    // The aff region is untouched.
    expect(getSideRegion(editor, "aff").node.textContent).toBe("");
  });

  it("focusSide moves the selection into the requested region", async () => {
    const editor = await openEditor("focus");
    focusSide(editor, "neg");
    const neg = getSideRegion(editor, "neg");
    const { from } = editor.state.selection;
    expect(from).toBeGreaterThanOrEqual(neg.contentStart);
    expect(from).toBeLessThanOrEqual(neg.contentEnd);
  });

  it("re-derives positions after an edit (snapshot discipline)", async () => {
    const editor = await openEditor("snapshot");
    // Insert into aff, which shifts every neg position later.
    const negBefore = getSideRegion(editor, "neg").pos;
    editor
      .chain()
      .insertContentAt(
        getSideRegion(editor, "aff").contentStart,
        "some long aff content",
      )
      .run();
    const negAfter = getSideRegion(editor, "neg").pos;
    expect(negAfter).toBeGreaterThan(negBefore);
  });

  it("sideRegionsFromDoc works on a doc node parsed from persisted JSON", async () => {
    const editor = await openEditor("from-json");
    editor
      .chain()
      .insertContentAt(getSideRegion(editor, "aff").contentStart, "aff")
      .run();
    const json = editor.getJSON();
    const doc = ProseMirrorNode.fromJSON(editor.schema, json);

    const regions = sideRegionsFromDoc(doc);
    expect(regions.aff.node.textContent).toBe("aff");
    expect(regions.neg.node.textContent).toBe("");
  });

  it("throws for a document that is not block-file shaped", async () => {
    // A plain (non-block-file) editor: its doc has paragraphs at top level, no
    // side sections, so addressing it must fail loudly rather than silently.
    const handle = openDocument({ id: "not-block-file", kind: "speech-doc" });
    await handle.whenLoaded;
    handles.push(handle);
    const editor = createEditor({
      binding: { handle, fragment: "body" },
      extensions: editorPreset(),
    });
    editors.push(editor);

    expect(() => getSideRegions(editor)).toThrow(/missing its "aff" section/);
  });
});
