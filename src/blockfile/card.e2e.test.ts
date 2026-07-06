/**
 * Whole-stack end-to-end proof for the Card Anatomy & Tag System feature.
 *
 * The three earlier card slices unit-tested each piece in isolation: the node
 * model (`card.test.ts` - four regions, the bracketed free-form tag, independent
 * body marks), the card-as-a-unit addressability API (`card-unit.test.ts` -
 * locate / select / read a card from positions found by an independent walk), and
 * quick creation (`card-create.test.ts` - the `insertCard` command + `cardCreate`
 * shortcut). This test closes the loop by driving the *whole stack* the way the
 * real Block File screen composes it, top to bottom, with *no mocks*: the
 * workspace singleton (`ensureBlockFile` through the real document service and
 * IndexedDB) and the exact editor preset the screen ships
 * (`blockFileExtensions` + `cardExtensions` + `cardCreate`).
 *
 * It exercises the debater's actual card lifecycle end to end:
 *
 *   author phase (one service instance)
 *     -> insertCard (the quick-create command) drops a fresh card in the caret's
 *        side and lands the cursor in the tag region, ready to type
 *     -> fill all four regions by typing (tag, tagline, cite, body)
 *     -> apply bold + highlight together on the same body run (coexistence)
 *     -> address the card as a unit: getCardAt locates it, selectCard sets a whole-
 *        card NodeSelection, readCardRegions reads every region back, serializeCard
 *        yields a re-insertable unit
 *   restart phase (a completely fresh service over the same backend)
 *     -> ensureBlockFile finds the *same* singleton
 *     -> the whole card survived: four regions, every field's text, and both body
 *        marks coexisting on the run
 *     -> re-address the persisted card as a unit through the card-unit API
 *
 * Assertions stay behavioural (the card-unit reads, region text, mark names on the
 * run), never ProseMirror plugin internals or pixels. Positions that drive the
 * card-unit *locator* are derived by an independent document walk, never from the
 * API under test - the same discipline as `card-unit.test.ts`.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";

import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME } from "../editor/marks";
import { ensureBlockFile } from "../blockfile-workspace";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "./schema";
import { focusSide } from "./sections";
import {
  CARD_NODE_NAME,
  CARD_TAG_NODE_NAME,
  CARD_TAGLINE_NODE_NAME,
  CARD_CITE_NODE_NAME,
  CARD_BODY_NODE_NAME,
  cardExtensions,
} from "./card";
import {
  insertCard,
  cardCreate,
  CARD_CREATE_SHORTCUT,
} from "./card-create";
import {
  getCardAt,
  getSelectedCard,
  selectCard,
  readCardRegions,
  serializeCard,
} from "./card-unit";

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

/**
 * Build a block-file editor with the *exact* preset the Block File screen ships:
 * the side schema, the card node model, and the quick-create keyboard binding, all
 * layered through the shared preset's feature-extension seam.
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

/**
 * A caret position inside a card region's first text block (independent walk).
 * The three header regions are themselves text blocks (`text*`), so the caret sits
 * just inside them; the body holds paragraphs, so the caret goes into its first
 * paragraph. Never uses the card-unit API - it is one of the things under test.
 */
function caretInRegion(editor: Editor, nodeName: string): number {
  let target: number | null = null;
  editor.state.doc.descendants((node, at) => {
    if (target !== null) return false;
    if (node.type.name === nodeName) {
      target = node.isTextblock ? at + 1 : at + 2;
      return false;
    }
    return true;
  });
  if (target === null) throw new Error(`caretInRegion: no "${nodeName}" region`);
  return target;
}

/** Move the caret into a region and type `text` into it. */
function typeInto(editor: Editor, nodeName: string, text: string): void {
  editor.chain().setTextSelection(caretInRegion(editor, nodeName)).insertContent(text).run();
}

/** The `{ from, to }` range of a text run by its text (independent walk). */
function textRunRange(editor: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range) return false;
    if (node.isText && node.text === text) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`textRunRange: no run "${text}"`);
  return range;
}

/** A position strictly inside a text run (independent walk). */
function posInsideTextRun(editor: Editor, text: string): number {
  return textRunRange(editor, text).from + 1;
}

/** The first `card` node in the document (independent walk), or null. */
function findFirstCard(editor: Editor): ProseMirrorNode | null {
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

/** Sorted mark-type names on the first text run of the first card body. */
function bodyRunMarkNames(editor: Editor): string[] {
  let names: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== CARD_BODY_NODE_NAME) return true;
    const leaf = node.firstChild?.firstChild; // paragraph -> text run
    names = (leaf?.marks ?? []).map((m) => m.type.name).sort();
    return false;
  });
  return names;
}

const CARD = {
  tag: "NU",
  tagline: "Warming is anthropogenic",
  cite: "Smith 24 [Prof of Climate, MIT]",
  body: "core evidence",
};

describe("card anatomy & tag system end-to-end", () => {
  it("creates, fills, marks, and addresses a card as a unit - across a fresh-instance reload", async () => {
    let blockFileId = "";

    // --- Author phase: one service instance --------------------------------
    {
      const service = openDocumentService();
      services.push(service);

      blockFileId = await ensureBlockFile(service);
      const handle = await service.open(blockFileId);
      await handle.whenLoaded;
      const editor = openEditor(handle);

      // The screen's real preset installs the quick-create shortcut extension.
      expect(
        editor.extensionManager.extensions.some((e) => e.name === "cardCreate"),
      ).toBe(true);
      expect(CARD_CREATE_SHORTCUT).toBe("Mod-Shift-c");

      // 1) Quick-create: drop a fresh card into the aff side. The command lands
      //    the caret in the (empty) tag region, ready to type.
      focusSide(editor, "aff");
      insertCard(editor);
      expect(editor.state.selection.$from.parent.type.name).toBe(
        CARD_TAG_NODE_NAME,
      );

      // 2) Fill all four regions by typing. The tag caret is already placed by
      //    insertCard; type straight into it, then navigate into the rest.
      editor.commands.insertContent(CARD.tag);
      typeInto(editor, CARD_TAGLINE_NODE_NAME, CARD.tagline);
      typeInto(editor, CARD_CITE_NODE_NAME, CARD.cite);
      typeInto(editor, CARD_BODY_NODE_NAME, CARD.body);

      // 3) Apply bold + highlight together on the same body run - they coexist.
      const bodyRange = textRunRange(editor, CARD.body);
      editor
        .chain()
        .setTextSelection(bodyRange)
        .setBold()
        .setHighlight()
        .run();
      expect(bodyRunMarkNames(editor)).toEqual(
        [BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME].sort(),
      );

      // 4) Address the card as a unit through the card-unit API, driven by a
      //    position found independently (inside the body run).
      const bodyPos = posInsideTextRun(editor, CARD.body);
      const located = getCardAt(editor, bodyPos);
      expect(located).not.toBeNull();
      expect(located!.node.type.name).toBe(CARD_NODE_NAME);
      // Every region is keyed and exposed on the located unit.
      expect(located!.regions.tag.node.type.name).toBe(CARD_TAG_NODE_NAME);
      expect(located!.regions.tagline.node.type.name).toBe(CARD_TAGLINE_NODE_NAME);
      expect(located!.regions.cite.node.type.name).toBe(CARD_CITE_NODE_NAME);
      expect(located!.regions.body.node.type.name).toBe(CARD_BODY_NODE_NAME);

      // selectCard sets a whole-card NodeSelection spanning exactly the unit.
      expect(selectCard(editor, bodyPos)).toBe(true);
      const sel = editor.state.selection;
      expect(sel instanceof NodeSelection).toBe(true);
      expect((sel as NodeSelection).node.type.name).toBe(CARD_NODE_NAME);
      expect(sel.from).toBe(located!.from);
      expect(sel.to).toBe(located!.to);

      // getSelectedCard reads the same unit back off that node selection, and
      // readCardRegions returns every filled field (headers as text, body as JSON).
      const selectedCard = getSelectedCard(editor)!.node;
      const regions = readCardRegions(selectedCard);
      expect(regions).toMatchObject({
        tag: CARD.tag,
        tagline: CARD.tagline,
        cite: CARD.cite,
      });
      expect(regions.body.type).toBe(CARD_BODY_NODE_NAME);
      expect(regions.body.content?.[0]?.content?.[0]?.text).toBe(CARD.body);
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

    const reopened = await restarted.open(resolvedId);
    await reopened.whenLoaded;
    const editor = openEditor(reopened);

    // The whole card structure survived, in region order.
    const reloadedCard = findFirstCard(editor);
    expect(reloadedCard).not.toBeNull();
    const regionTypes: string[] = [];
    reloadedCard!.forEach((child) => regionTypes.push(child.type.name));
    expect(regionTypes).toEqual([
      CARD_TAG_NODE_NAME,
      CARD_TAGLINE_NODE_NAME,
      CARD_CITE_NODE_NAME,
      CARD_BODY_NODE_NAME,
    ]);

    // Every field's text persisted, and both body marks still coexist on the run.
    const reloadedRegions = readCardRegions(reloadedCard!);
    expect(reloadedRegions).toMatchObject({
      tag: CARD.tag,
      tagline: CARD.tagline,
      cite: CARD.cite,
    });
    expect(reloadedRegions.body.content?.[0]?.content?.[0]?.text).toBe(CARD.body);
    expect(bodyRunMarkNames(editor)).toEqual(
      [BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME].sort(),
    );

    // Re-address the persisted card as a unit through the card-unit API.
    const reloadedBodyPos = posInsideTextRun(editor, CARD.body);
    const relocated = getCardAt(editor, reloadedBodyPos);
    expect(relocated).not.toBeNull();
    expect(selectCard(editor, reloadedBodyPos)).toBe(true);
    expect(getSelectedCard(editor)?.node.type.name).toBe(CARD_NODE_NAME);

    // serializeCard yields a re-insertable unit whose four regions round-trip.
    const unit = serializeCard(relocated!.node);
    expect(unit.type).toBe(CARD_NODE_NAME);
    expect(unit.content?.map((c) => c.type)).toEqual([
      CARD_TAG_NODE_NAME,
      CARD_TAGLINE_NODE_NAME,
      CARD_CITE_NODE_NAME,
      CARD_BODY_NODE_NAME,
    ]);
  });
});
