/**
 * Behavioral tests for the demo card tool - the reference tool that proves the
 * toolbar seam end-to-end without shipping a real card-cutting tool (Extract,
 * Shrink, ...), the same way `src/settings/demo` is the reference settings
 * contribution. It selects the card the caret sits in, honouring its one
 * setting, so a click on the toolbar has a visible, non-destructive effect.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  buildCardContent,
  getSideRegion,
  getSelectedCard,
} from "../../blockfile";
import { demoCardTool } from "./demoCardTool";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openEditor(id: string): Promise<Editor> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
    }),
  });
  editors.push(editor);
  return editor;
}

function insertCardInAff(editor: Editor): number {
  const aff = getSideRegion(editor, "aff");
  const at = aff.contentEnd;
  editor
    .chain()
    .insertContentAt(at, buildCardContent({ tag: "T" }), {
      updateSelection: false,
    })
    .run();
  return at + 2;
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

describe("demoCardTool", () => {
  it("declares an id, label, and a settings schema", () => {
    expect(demoCardTool.id).toBe("demo");
    expect(demoCardTool.label).toBeTruthy();
    expect(demoCardTool.settings.focusAfter.default).toBe(true);
  });

  it("selects the card the caret sits in", async () => {
    const editor = await openEditor("select");
    const posInCard = insertCardInAff(editor);
    editor.commands.setTextSelection(posInCard);

    const changed = demoCardTool.applyToSelection(
      editor,
      demoCardTool.settings as never,
    );

    expect(changed).toBe(true);
    // The selection is now a NodeSelection spanning the whole card.
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(getSelectedCard(editor)).not.toBeNull();
  });

  it("is a no-op when the caret is not in a card", async () => {
    const editor = await openEditor("noop");
    insertCardInAff(editor);
    editor.commands.setTextSelection(1); // aff leading paragraph

    const changed = demoCardTool.applyToSelection(editor, { focusAfter: true });

    expect(changed).toBe(false);
  });
});
