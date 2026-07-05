/**
 * Whole-stack end-to-end proof for the block-file scaffold.
 *
 * This drives the *real* stack over a *real* document handle, top to bottom, with
 * no mocks: the workspace find-or-create singleton (`ensureBlockFile` through the
 * document service), the enforced aff/neg schema, the section maintenance ops
 * (add / rename / reorder), and content edits - then throws the whole service
 * instance away and reopens the same IndexedDB backend through a *completely
 * fresh* service (a simulated app relaunch) to prove everything is restored.
 *
 * It deliberately spans every block-file layer the earlier tasks unit-tested in
 * isolation, to catch a seam that only breaks when the pieces are composed:
 *
 *   author phase (one service instance)
 *     -> ensureBlockFile creates the workspace singleton
 *     -> add argument sections under *both* sides
 *     -> add card content under those sections
 *     -> rename one section, reorder another (carrying its content block)
 *   restart phase (a completely fresh service over the same backend)
 *     -> ensureBlockFile finds the *same* singleton (no second block file)
 *     -> assert full restore: sides intact, section order, labels, and content
 *
 * Assertions stay behavioural (the section query + document text), never
 * ProseMirror internals or pixels.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";

import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { ensureBlockFile, BLOCK_FILE_KIND } from "../blockfile-workspace";
import type { BlockSide } from "./side";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "./schema";
import { getSideRegion } from "./sections";
import { getSideSections } from "./argument-sections";
import { addSection, renameSection, moveSection, getSectionRange } from "./section-ops";

// A fresh IndexedDB backend per test; the two service instances in each test
// share this one backend - that shared backend *is* the persistence under test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let services: DocumentService[] = [];
let editors: Editor[] = [];

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const service of services) await service.close();
  editors = [];
  services = [];
});

/** Opens an editor over a block-file handle with the real schema + preset. */
function openEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  editors.push(editor);
  return editor;
}

/** Appends a body paragraph to the bottom of a side (falls under its last section). */
function appendBody(editor: Editor, side: BlockSide, text: string): void {
  const { contentEnd } = getSideRegion(editor, side);
  editor
    .chain()
    .insertContentAt(contentEnd, { type: "paragraph", content: [{ type: "text", text }] })
    .run();
}

/** The plain-text labels of a side's sections, in order. */
function labels(editor: Editor, side: BlockSide): string[] {
  return getSideSections(editor, side).map((s) => s.label);
}

describe("block-file end-to-end", () => {
  it("restores sides, section order, labels, and content after a fresh-instance reload", async () => {
    let blockFileId = "";

    // --- Author phase: one service instance --------------------------------
    {
      const service = openDocumentService();
      services.push(service);

      // The workspace find-or-create: first call mints the singleton block file.
      blockFileId = await ensureBlockFile(service);
      expect(blockFileId).not.toBe("");

      const handle = await service.open(blockFileId);
      await handle.whenLoaded;
      const editor = openEditor(handle);

      // Add argument sections under *both* sides.
      addSection(editor, "aff", "AT: Gold");
      addSection(editor, "aff", "AT: Wind");
      addSection(editor, "neg", "AT: Solar");
      addSection(editor, "neg", "AT: Coal");

      // Add card content under sections (appends to the bottom of each side, so
      // it falls under that side's last section at the time of the call).
      appendBody(editor, "aff", "wind card body");
      appendBody(editor, "neg", "coal card body");

      // Rename an aff section.
      renameSection(editor, "aff", 0, "AT: Gold Standard");

      // Reorder a neg section: move AT: Coal (with its body) above AT: Solar.
      moveSection(editor, "neg", 1, 0);

      // Sanity within the author phase before we drop the instance.
      expect(labels(editor, "aff")).toEqual(["AT: Gold Standard", "AT: Wind"]);
      expect(labels(editor, "neg")).toEqual(["AT: Coal", "AT: Solar"]);
    }

    // Tear down the author instance completely - only IndexedDB survives.
    for (const editor of editors) editor.destroy();
    for (const service of services) await service.close();
    editors = [];
    services = [];

    // --- Restart phase: a completely fresh service over the same backend ----
    const restarted = openDocumentService();
    services.push(restarted);

    // ensureBlockFile finds the *same* singleton - it does not create a second.
    const resolvedId = await ensureBlockFile(restarted);
    expect(resolvedId).toBe(blockFileId);
    const blockFiles = (await restarted.list()).filter(
      (e) => e.kind === BLOCK_FILE_KIND,
    );
    expect(blockFiles).toHaveLength(1);

    const reopened = await restarted.open(resolvedId);
    await reopened.whenLoaded;
    const editor = openEditor(reopened);

    // Both enforced sides survived, in order.
    expect(editor.getJSON().content?.map((n) => n.type)).toEqual([
      "affSection",
      "negSection",
    ]);

    // Section order + labels restored on both sides (the rename + reorder stuck).
    expect(labels(editor, "aff")).toEqual(["AT: Gold Standard", "AT: Wind"]);
    expect(labels(editor, "neg")).toEqual(["AT: Coal", "AT: Solar"]);

    // Content restored under the right sections, carried by the reorder.
    const windRange = getSectionRange(editor, "aff", 1);
    expect(editor.state.doc.textBetween(windRange.from, windRange.to, "\n")).toContain(
      "wind card body",
    );
    // AT: Coal moved to index 0 and its body travelled with it.
    const coalRange = getSectionRange(editor, "neg", 0);
    const coalText = editor.state.doc.textBetween(coalRange.from, coalRange.to, "\n");
    expect(coalText).toContain("AT: Coal");
    expect(coalText).toContain("coal card body");
  });
});
