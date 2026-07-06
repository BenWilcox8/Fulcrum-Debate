/**
 * Behavioral tests for the card node model: the four enforced regions (tag,
 * tagline, cite, body), the free-form bracketed tag, independent bold/highlight
 * marks inside the body, and persistence of the whole structure through the
 * document layer.
 *
 * Follows the established block-file pattern - `fake-indexeddb/auto` + a fresh
 * `IDBFactory` per test, assertions on the editor API / document JSON, never
 * ProseMirror plugin internals or pixels.
 */
import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

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

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openHandle(id: string): Promise<DocumentHandle> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

/**
 * Build a block-file editor with the card node model layered on top of the
 * block-file schema through the shared preset's feature-extension seam.
 */
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

/** Insert a card at the top of the aff region and return the editor. */
function insertCard(editor: Editor, fields?: Parameters<typeof buildCardContent>[0]): Editor {
  const aff = getSideRegion(editor, "aff");
  // Append the card after the side's leading paragraph (the natural place cards
  // accumulate). `updateSelection: false` keeps the cursor where it was rather
  // than trying to land it inside the block-level card (which holds no direct
  // inline content).
  editor
    .chain()
    .insertContentAt(aff.contentEnd, buildCardContent(fields), {
      updateSelection: false,
    })
    .run();
  return editor;
}

/** The first `card` node in the document, or null. */
function findCard(editor: Editor): ProseMirrorNode | null {
  let card: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node) => {
    if (card) return false;
    if (node.type.name === CARD_NODE_NAME) {
      card = node;
      return false;
    }
    return true;
  });
  return card;
}

/** The child region node-type names of the first card, in order. */
function cardRegionTypes(editor: Editor): string[] {
  const card = findCard(editor);
  if (!card) return [];
  const types: string[] = [];
  card.forEach((child) => types.push(child.type.name));
  return types;
}

/** Locate the `{ from, to }` range of a text run inside the card body by its text. */
function bodyTextRange(editor: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`bodyTextRange: no text run "${text}" found`);
  return range;
}

/** The sorted mark-type names on the first text run of the card body. */
function bodyRunMarkNames(editor: Editor): string[] {
  const card = findCard(editor);
  if (!card) return [];
  const json = card.toJSON() as JSONContent;
  const body = json.content?.find((c) => c.type === CARD_BODY_NODE_NAME);
  const leaf = body?.content?.[0]?.content?.[0];
  return (leaf?.marks ?? []).map((m) => m.type).sort();
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

describe("card node model", () => {
  it("creates a card with exactly the four regions in order", async () => {
    const editor = insertCard(openEditor(await openHandle("regions")));

    expect(cardRegionTypes(editor)).toEqual([
      CARD_TAG_NODE_NAME,
      CARD_TAGLINE_NODE_NAME,
      CARD_CITE_NODE_NAME,
      CARD_BODY_NODE_NAME,
    ]);
  });

  it("auto-fills all four regions when the schema builds a bare card", async () => {
    const editor = openEditor(await openHandle("autofill"));
    // The schema must be able to fill a bare card from its type alone - the
    // guarantee a future quick-create command relies on. `createAndFill` fills
    // every required region (the text regions empty, the body a paragraph).
    const filled = editor.schema.nodes[CARD_NODE_NAME].createAndFill();
    expect(filled).not.toBeNull();

    const json = filled!.toJSON() as JSONContent;
    expect(json.content?.map((c) => c.type)).toEqual([
      CARD_TAG_NODE_NAME,
      CARD_TAGLINE_NODE_NAME,
      CARD_CITE_NODE_NAME,
      CARD_BODY_NODE_NAME,
    ]);

    const bodyJson = json.content?.find((c) => c.type === CARD_BODY_NODE_NAME);
    // The body backfills a single empty paragraph so it is immediately editable.
    expect(bodyJson?.content).toEqual([{ type: "paragraph" }]);
  });

  it("lives inside a block-file side region", async () => {
    const editor = insertCard(openEditor(await openHandle("inside-side")));
    const affJson = getSideRegion(editor, "aff").node.toJSON() as JSONContent;
    expect(affJson.content?.some((c) => c.type === CARD_NODE_NAME)).toBe(true);
  });

  describe("tag region", () => {
    it("renders bracketed around the token", async () => {
      const editor = insertCard(openEditor(await openHandle("tag-bracket")), {
        tag: "NU",
      });
      // The brackets are structural chrome the node renders, not typed text.
      expect(editor.getHTML()).toContain("[");
      expect(editor.getHTML()).toContain("]");
      expect(editor.getHTML()).toContain(">NU<");
    });

    it("accepts any free-form 2-3 letter token, not a fixed enum", async () => {
      for (const token of ["T", "NU", "CP", "DA", "PIC"]) {
        const editor = insertCard(openEditor(await openHandle(`tag-${token}`)), {
          tag: token,
        });
        const card = findCard(editor)!;
        const tagJson = (card.toJSON() as JSONContent).content?.find(
          (c) => c.type === CARD_TAG_NODE_NAME,
        );
        expect(tagJson?.content?.[0]?.text).toBe(token);
      }
    });
  });

  describe("body marks (bold + highlight independence)", () => {
    it("applies bold and highlight simultaneously to the same body run", async () => {
      const editor = insertCard(openEditor(await openHandle("both-marks")), {
        body: "evidence",
      });
      const { from, to } = bodyTextRange(editor, "evidence");
      editor
        .chain()
        .setTextSelection({ from, to })
        .setBold()
        .setHighlight()
        .run();

      expect(bodyRunMarkNames(editor)).toEqual(
        [BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME].sort(),
      );
    });

    it("toggles the two body marks independently", async () => {
      const editor = insertCard(openEditor(await openHandle("independent")), {
        body: "evidence",
      });
      const { from, to } = bodyTextRange(editor, "evidence");
      editor
        .chain()
        .setTextSelection({ from, to })
        .setBold()
        .setHighlight()
        .run();

      // Drop bold; highlight survives untouched.
      editor.chain().setTextSelection({ from, to }).unsetBold().run();
      expect(bodyRunMarkNames(editor)).toEqual([HIGHLIGHT_MARK_NAME]);

      // Drop highlight; nothing remains.
      editor.chain().setTextSelection({ from, to }).unsetHighlight().run();
      expect(bodyRunMarkNames(editor)).toEqual([]);
    });
  });

  it("round-trips the whole card structure and content through the document layer", async () => {
    const h1 = await openHandle("roundtrip");
    const e1 = openEditor(h1);
    insertCard(e1, {
      tag: "NU",
      tagline: "Warming is anthropogenic",
      cite: "Smith 24 [Prof of Climate, MIT]",
      body: "core evidence",
    });
    // Mark the body run so the mark structure is part of what must survive.
    const { from, to } = bodyTextRange(e1, "core evidence");
    e1.chain().setTextSelection({ from, to }).setBold().setHighlight().run();

    e1.destroy();
    editors = editors.filter((e) => e !== e1);
    await h1.close();
    handles = handles.filter((h) => h !== h1);

    // A genuinely fresh handle + editor over the same IndexedDB backend.
    const e2 = openEditor(await openHandle("roundtrip"));

    expect(cardRegionTypes(e2)).toEqual([
      CARD_TAG_NODE_NAME,
      CARD_TAGLINE_NODE_NAME,
      CARD_CITE_NODE_NAME,
      CARD_BODY_NODE_NAME,
    ]);

    const card = findCard(e2)!;
    const json = card.toJSON() as JSONContent;
    const region = (type: string) =>
      json.content?.find((c) => c.type === type);
    expect(region(CARD_TAG_NODE_NAME)?.content?.[0]?.text).toBe("NU");
    expect(region(CARD_TAGLINE_NODE_NAME)?.content?.[0]?.text).toBe(
      "Warming is anthropogenic",
    );
    expect(region(CARD_CITE_NODE_NAME)?.content?.[0]?.text).toBe(
      "Smith 24 [Prof of Climate, MIT]",
    );
    expect(region(CARD_BODY_NODE_NAME)?.content?.[0]?.content?.[0]?.text).toBe(
      "core evidence",
    );
    expect(bodyRunMarkNames(e2)).toEqual(
      [BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME].sort(),
    );
  });

  it("builds free-form card content without a fixed tag enum via buildCardContent", () => {
    // A pure JSON builder (no editor) - the seam the quick-create UI will use.
    const json = buildCardContent({ tag: "ZZ", tagline: "t", cite: "c", body: "b" });
    expect(json.type).toBe(CARD_NODE_NAME);
    expect(json.content?.map((c) => c.type)).toEqual([
      CARD_TAG_NODE_NAME,
      CARD_TAGLINE_NODE_NAME,
      CARD_CITE_NODE_NAME,
      CARD_BODY_NODE_NAME,
    ]);
  });
});
