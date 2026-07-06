/**
 * Behavioral tests for the card-as-unit addressability API: locate the card
 * containing a position, select a whole card programmatically, and read/serialize
 * a card's four regions individually.
 *
 * Follows the established block-file pattern - `fake-indexeddb/auto` + a fresh
 * `IDBFactory` per test, assertions on the editor API / document JSON, never
 * ProseMirror plugin internals or pixels. Positions used to drive the *locator*
 * are derived independently (walking the document for a known text run), so the
 * tests never lean on the API they are exercising to produce their own inputs.
 */
import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME } from "../editor/marks";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "./schema";
import { getSideRegion } from "./sections";
import {
  CARD_NODE_NAME,
  CARD_TAG_NODE_NAME,
  CARD_TAGLINE_NODE_NAME,
  CARD_CITE_NODE_NAME,
  CARD_BODY_NODE_NAME,
  cardExtensions,
  buildCardContent,
} from "./card";
import {
  CARD_REGION_KEYS,
  cardAt,
  getCardAt,
  getSelectedCard,
  selectCard,
  readCardRegionText,
  readCardRegions,
  serializeCardRegion,
  serializeCard,
} from "./card-unit";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

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

/** Insert a card after the aff region's leading paragraph and return the editor. */
function insertCard(
  editor: Editor,
  fields?: Parameters<typeof buildCardContent>[0],
): Editor {
  const aff = getSideRegion(editor, "aff");
  editor
    .chain()
    .insertContentAt(aff.contentEnd, buildCardContent(fields), {
      updateSelection: false,
    })
    .run();
  return editor;
}

/** The first `card` node and the position immediately before it (independent walk). */
function findCardNode(editor: Editor): { node: ProseMirrorNode; pos: number } {
  let result: { node: ProseMirrorNode; pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (result) return false;
    if (node.type.name === CARD_NODE_NAME) {
      result = { node, pos };
      return false;
    }
    return true;
  });
  if (!result) throw new Error("findCardNode: no card in document");
  return result;
}

/** A position strictly inside the text run whose text is `text` (independent walk). */
function posInsideTextRun(editor: Editor, text: string): number {
  let pos: number | null = null;
  editor.state.doc.descendants((node, at) => {
    if (pos !== null) return false;
    if (node.isText && node.text === text) {
      pos = at + 1;
      return false;
    }
    return true;
  });
  if (pos === null) throw new Error(`posInsideTextRun: no run "${text}"`);
  return pos;
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

describe("card-unit: locating the containing card", () => {
  it("locates the card from a position inside its body region", async () => {
    const editor = insertCard(openEditor(await openHandle("locate-body")), {
      body: "evidence",
    });
    const { node, pos } = findCardNode(editor);

    const located = getCardAt(editor, posInsideTextRun(editor, "evidence"));

    expect(located).not.toBeNull();
    expect(located!.node.type.name).toBe(CARD_NODE_NAME);
    // The located range spans exactly the whole card node.
    expect(located!.from).toBe(pos);
    expect(located!.to).toBe(pos + node.nodeSize);
  });

  it("locates the same card from a position inside a header region (the tag)", async () => {
    const editor = insertCard(openEditor(await openHandle("locate-tag")), {
      tag: "NU",
      body: "evidence",
    });
    const fromTag = getCardAt(editor, posInsideTextRun(editor, "NU"));
    const fromBody = getCardAt(editor, posInsideTextRun(editor, "evidence"));

    expect(fromTag).not.toBeNull();
    expect(fromBody).not.toBeNull();
    // Both header and body positions resolve to the one containing card.
    expect(fromTag!.from).toBe(fromBody!.from);
    expect(fromTag!.to).toBe(fromBody!.to);
  });

  it("returns null for a position outside any card (the side preamble)", async () => {
    const editor = insertCard(openEditor(await openHandle("locate-none")), {
      body: "evidence",
    });
    // Position 1 is inside the aff region's leading paragraph, before the card.
    expect(getCardAt(editor, 1)).toBeNull();
  });

  it("returns null for an out-of-range position instead of throwing", async () => {
    const editor = insertCard(openEditor(await openHandle("locate-oob")), {
      body: "evidence",
    });
    expect(getCardAt(editor, -1)).toBeNull();
    expect(getCardAt(editor, editor.state.doc.content.size + 5)).toBeNull();
    expect(getCardAt(editor, 2.5)).toBeNull();
  });

  it("cardAt is pure over a document node (no editor required)", async () => {
    const editor = insertCard(openEditor(await openHandle("locate-pure")), {
      body: "evidence",
    });
    const pos = posInsideTextRun(editor, "evidence");
    const viaEditor = getCardAt(editor, pos);
    const viaDoc = cardAt(editor.state.doc, pos);

    expect(viaDoc).not.toBeNull();
    expect(viaDoc!.from).toBe(viaEditor!.from);
    expect(viaDoc!.to).toBe(viaEditor!.to);
  });

  it("exposes each region node keyed by region, in card order", async () => {
    const editor = insertCard(openEditor(await openHandle("locate-regions")), {
      body: "evidence",
    });
    const located = getCardAt(editor, posInsideTextRun(editor, "evidence"))!;

    expect(CARD_REGION_KEYS).toEqual(["tag", "tagline", "cite", "body"]);
    expect(located.regions.tag.node.type.name).toBe(CARD_TAG_NODE_NAME);
    expect(located.regions.tagline.node.type.name).toBe(CARD_TAGLINE_NODE_NAME);
    expect(located.regions.cite.node.type.name).toBe(CARD_CITE_NODE_NAME);
    expect(located.regions.body.node.type.name).toBe(CARD_BODY_NODE_NAME);
    // Region ranges sit strictly inside the card's range, in order.
    expect(located.regions.tag.from).toBeGreaterThan(located.from);
    expect(located.regions.body.to).toBeLessThanOrEqual(located.to);
    expect(located.regions.tagline.from).toBeGreaterThanOrEqual(
      located.regions.tag.to,
    );
  });
});

describe("card-unit: selecting a whole card", () => {
  it("sets a NodeSelection spanning the whole card and returns true", async () => {
    const editor = insertCard(openEditor(await openHandle("select-card")), {
      body: "evidence",
    });
    const { node, pos } = findCardNode(editor);

    const ok = selectCard(editor, posInsideTextRun(editor, "evidence"));

    expect(ok).toBe(true);
    const selection = editor.state.selection;
    expect(selection instanceof NodeSelection).toBe(true);
    expect((selection as NodeSelection).node.type.name).toBe(CARD_NODE_NAME);
    expect(selection.from).toBe(pos);
    expect(selection.to).toBe(pos + node.nodeSize);
  });

  it("returns false and does not select when no card is at the position", async () => {
    const editor = insertCard(openEditor(await openHandle("select-none")), {
      body: "evidence",
    });
    const before = editor.state.selection;
    const ok = selectCard(editor, 1);

    expect(ok).toBe(false);
    expect(editor.state.selection.from).toBe(before.from);
  });

  it("defaults to the current selection when no position is given", async () => {
    const editor = insertCard(openEditor(await openHandle("select-default")), {
      body: "evidence",
    });
    // Place the cursor inside the body, then select its containing card.
    editor
      .chain()
      .setTextSelection(posInsideTextRun(editor, "evidence"))
      .run();

    expect(selectCard(editor)).toBe(true);
    expect(editor.state.selection instanceof NodeSelection).toBe(true);
    expect(
      (editor.state.selection as NodeSelection).node.type.name,
    ).toBe(CARD_NODE_NAME);
  });

  it("getSelectedCard finds the card under the cursor and under a node selection", async () => {
    const editor = insertCard(openEditor(await openHandle("selected-card")), {
      body: "evidence",
    });
    // Cursor inside the body.
    editor.chain().setTextSelection(posInsideTextRun(editor, "evidence")).run();
    expect(getSelectedCard(editor)?.node.type.name).toBe(CARD_NODE_NAME);

    // After node-selecting the card, it is still reported.
    selectCard(editor);
    expect(getSelectedCard(editor)?.node.type.name).toBe(CARD_NODE_NAME);

    // Cursor in the preamble: no card.
    editor.chain().setTextSelection(1).run();
    expect(getSelectedCard(editor)).toBeNull();
  });
});

describe("card-unit: reading and serializing regions individually", () => {
  const fields = {
    tag: "NU",
    tagline: "Warming is anthropogenic",
    cite: "Smith 24 [Prof of Climate, MIT]",
    body: "core evidence",
  };

  it("reads each region's plain text by key", async () => {
    const editor = insertCard(openEditor(await openHandle("read-text")), fields);
    const card = findCardNode(editor).node;

    expect(readCardRegionText(card, "tag")).toBe("NU");
    expect(readCardRegionText(card, "tagline")).toBe(fields.tagline);
    expect(readCardRegionText(card, "cite")).toBe(fields.cite);
    expect(readCardRegionText(card, "body")).toBe("core evidence");
  });

  it("serializes a single region node to document-JSON", async () => {
    const editor = insertCard(openEditor(await openHandle("serialize-region")), fields);
    const card = findCardNode(editor).node;

    const tagJson = serializeCardRegion(card, "tag");
    expect(tagJson.type).toBe(CARD_TAG_NODE_NAME);
    expect(tagJson.content?.[0]?.text).toBe("NU");

    const bodyJson = serializeCardRegion(card, "body");
    expect(bodyJson.type).toBe(CARD_BODY_NODE_NAME);
    expect(bodyJson.content?.[0]?.content?.[0]?.text).toBe("core evidence");
  });

  it("reads the whole card as a structured snapshot (headers as text, body as JSON)", async () => {
    const editor = insertCard(openEditor(await openHandle("read-regions")), fields);
    const card = findCardNode(editor).node;

    const regions = readCardRegions(card);
    expect(regions.tag).toBe("NU");
    expect(regions.tagline).toBe(fields.tagline);
    expect(regions.cite).toBe(fields.cite);
    expect(regions.body.type).toBe(CARD_BODY_NODE_NAME);
    expect(regions.body.content?.[0]?.content?.[0]?.text).toBe("core evidence");
  });

  it("preserves body marks through region serialization", async () => {
    const editor = insertCard(openEditor(await openHandle("serialize-marks")), {
      body: "evidence",
    });
    const from = posInsideTextRun(editor, "evidence") - 1;
    const to = from + "evidence".length;
    editor.chain().setTextSelection({ from, to }).setBold().setHighlight().run();

    const card = findCardNode(editor).node;
    const bodyJson = serializeCardRegion(card, "body");
    const leaf = bodyJson.content?.[0]?.content?.[0];
    const markNames = (leaf?.marks ?? []).map((m) => m.type).sort();
    expect(markNames).toEqual([BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME].sort());
  });

  it("serializes the whole card as one re-insertable JSON unit", async () => {
    const editor = insertCard(openEditor(await openHandle("serialize-card")), fields);
    const card = findCardNode(editor).node;

    const json = serializeCard(card);
    expect(json.type).toBe(CARD_NODE_NAME);
    expect(json.content?.map((c) => c.type)).toEqual([
      CARD_TAG_NODE_NAME,
      CARD_TAGLINE_NODE_NAME,
      CARD_CITE_NODE_NAME,
      CARD_BODY_NODE_NAME,
    ]);

    // The unit round-trips: re-inserting it yields a second, structurally equal card.
    const aff = getSideRegion(editor, "aff");
    editor
      .chain()
      .insertContentAt(aff.contentEnd, json as JSONContent, { updateSelection: false })
      .run();
    let cardCount = 0;
    editor.state.doc.descendants((n) => {
      if (n.type.name === CARD_NODE_NAME) cardCount += 1;
    });
    expect(cardCount).toBe(2);
  });

  it("throws a clear error when asked to read a non-card node", async () => {
    const editor = insertCard(openEditor(await openHandle("read-noncard")), fields);
    const body = getSideRegion(editor, "aff").node;

    expect(() => serializeCard(body)).toThrow(/card/i);
    expect(() => serializeCardRegion(body, "tag")).toThrow(/card/i);
    expect(() => readCardRegionText(body, "tag")).toThrow(/card/i);
  });
});
