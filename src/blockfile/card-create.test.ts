/**
 * Behavioral tests for quick card creation: the `insertCard` command that drops a
 * fully-structured card skeleton into whichever side the debater is working in and
 * lands the cursor in the tag region, plus the `cardCreate` extension that binds it
 * to a keyboard shortcut.
 *
 * Follows the established block-file pattern - `fake-indexeddb/auto` + a fresh
 * `IDBFactory` per test, assertions on the editor API / document JSON, never
 * ProseMirror plugin internals or pixels.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "./schema";
import { getSideRegion, focusSide } from "./sections";
import type { BlockSide } from "./side";
import {
  CARD_NODE_NAME,
  CARD_TAG_NODE_NAME,
  CARD_TAGLINE_NODE_NAME,
  CARD_CITE_NODE_NAME,
  CARD_BODY_NODE_NAME,
  cardExtensions,
} from "./card";
import { insertCard, cardCreate, CARD_CREATE_SHORTCUT } from "./card-create";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openHandle(id: string): Promise<DocumentHandle> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

/**
 * Build a block-file editor with the card node model *and* the quick-create
 * extension layered on through the shared preset's feature-extension seam - the
 * exact composition the Block File screen ships.
 */
function openEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions, cardCreate],
    }),
  });
  editors.push(editor);
  return editor;
}

/** The first `card` node found within a side's region, or null. */
function findCardInSide(editor: Editor, side: BlockSide): ProseMirrorNode | null {
  const region = getSideRegion(editor, side).node;
  let card: ProseMirrorNode | null = null;
  region.descendants((node) => {
    if (card) return false;
    if (node.type.name === CARD_NODE_NAME) {
      card = node;
      return false;
    }
    return true;
  });
  return card;
}

/** The child region node-type names of a card, in order. */
function cardRegionTypes(card: ProseMirrorNode): string[] {
  const types: string[] = [];
  card.forEach((child) => types.push(child.type.name));
  return types;
}

/** The plain text of a card's tag region. */
function cardTagText(card: ProseMirrorNode): string {
  const json = card.toJSON() as JSONContent;
  const tag = json.content?.find((c) => c.type === CARD_TAG_NODE_NAME);
  return tag?.content?.map((n) => n.text ?? "").join("") ?? "";
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

describe("insertCard", () => {
  it("inserts a fully-structured card with all four regions", async () => {
    const editor = openEditor(await openHandle("regions"));
    focusSide(editor, "aff");

    insertCard(editor);

    const card = findCardInSide(editor, "aff");
    expect(card).not.toBeNull();
    expect(cardRegionTypes(card!)).toEqual([
      CARD_TAG_NODE_NAME,
      CARD_TAGLINE_NODE_NAME,
      CARD_CITE_NODE_NAME,
      CARD_BODY_NODE_NAME,
    ]);
  });

  it("lands the cursor in the tag region, ready to type", async () => {
    const editor = openEditor(await openHandle("cursor-in-tag"));
    focusSide(editor, "aff");

    insertCard(editor);

    // The selection is empty (a caret) and its parent is the tag region.
    const { selection } = editor.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.type.name).toBe(CARD_TAG_NODE_NAME);

    // Proof of "ready to type": text typed now flows straight into the tag.
    editor.commands.insertContent("NU");
    expect(cardTagText(findCardInSide(editor, "aff")!)).toBe("NU");
  });

  it("creates a card in the aff side when the cursor is in aff", async () => {
    const editor = openEditor(await openHandle("in-aff"));
    focusSide(editor, "aff");

    insertCard(editor);

    expect(findCardInSide(editor, "aff")).not.toBeNull();
    expect(findCardInSide(editor, "neg")).toBeNull();
  });

  it("creates a card in the neg side when the cursor is in neg", async () => {
    const editor = openEditor(await openHandle("in-neg"));
    focusSide(editor, "neg");

    insertCard(editor);

    expect(findCardInSide(editor, "neg")).not.toBeNull();
    expect(findCardInSide(editor, "aff")).toBeNull();
  });

  it("honors an explicit side regardless of where the cursor sits", async () => {
    const editor = openEditor(await openHandle("explicit-side"));
    focusSide(editor, "aff");

    insertCard(editor, { side: "neg" });

    expect(findCardInSide(editor, "neg")).not.toBeNull();
    expect(findCardInSide(editor, "aff")).toBeNull();
  });

  it("seeds the card from optional free-form fields", async () => {
    const editor = openEditor(await openHandle("with-fields"));
    focusSide(editor, "aff");

    insertCard(editor, { fields: { tag: "CP" } });

    expect(cardTagText(findCardInSide(editor, "aff")!)).toBe("CP");
  });

  it("inserts the card as a sibling right after the block the cursor is in", async () => {
    const editor = openEditor(await openHandle("after-current"));
    // A section header sits at the top of the aff side; put the cursor in it.
    focusSide(editor, "aff");

    insertCard(editor);

    // The aff side's first block is still its leading paragraph (not the card):
    // the card was inserted *after* the cursor's block, never before it, so the
    // side never begins with a card.
    const affJson = getSideRegion(editor, "aff").node.toJSON() as JSONContent;
    expect(affJson.content?.[0]?.type).not.toBe(CARD_NODE_NAME);
    expect(affJson.content?.some((c) => c.type === CARD_NODE_NAME)).toBe(true);
  });
});

describe("cardCreate extension", () => {
  it("is registered on a block-file editor", async () => {
    const editor = openEditor(await openHandle("registered"));
    expect(
      editor.extensionManager.extensions.some((e) => e.name === "cardCreate"),
    ).toBe(true);
  });

  it("binds the quick-create keyboard shortcut", () => {
    // A Mod-based chord, consistent with the shared marks' shortcut convention.
    expect(CARD_CREATE_SHORTCUT).toBe("Mod-Shift-c");
  });
});
