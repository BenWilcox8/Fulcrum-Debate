/**
 * Behavioral tests for the pure Send-to-Block-File operations.
 *
 * Follows the established block-file pattern - `fake-indexeddb/auto` + a fresh
 * `IDBFactory` per test, assertions on the query results and document JSON via
 * the editor command API, never ProseMirror internals. A card is seeded into an
 * argument section with bold + highlight marks on its body so the "structure and
 * marks are preserved on insertion" contract is exercised end to end.
 */
import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  addSection,
  getSectionRange,
  CARD_NODE_NAME,
} from "../../blockfile";
import {
  listSendDestinations,
  sendSelectedCard,
} from "./send-to-block-file";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openEditor(id: string): Promise<Editor> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    // Full preset (bold/highlight/font-size/headings) + card + section schema, so
    // marks exist on the body and cards are addressable - the way the app ships.
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
    }),
  });
  editors.push(editor);
  return editor;
}

/** A card JSON node whose body carries a bold run and a highlight run. */
function markedCard(tag: string, tagline: string): JSONContent {
  return {
    type: CARD_NODE_NAME,
    content: [
      { type: "cardTag", content: [{ type: "text", text: tag }] },
      { type: "cardTagline", content: [{ type: "text", text: tagline }] },
      { type: "cardCite", content: [{ type: "text", text: "Smith 24" }] },
      {
        type: "cardBody",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "plain " },
              { type: "text", text: "bold", marks: [{ type: "bold" }] },
              { type: "text", text: " " },
              { type: "text", text: "read", marks: [{ type: "highlight" }] },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Inserts a card at the end of the section at `index` in `side` and drops the
 * caret inside it, so `getSelectedCard` resolves. Returns the card's start pos.
 */
function seedSelectedCard(
  editor: Editor,
  side: "aff" | "neg",
  index: number,
  card: JSONContent,
): number {
  const at = getSectionRange(editor, side, index).to;
  editor.chain().insertContentAt(at, card, { updateSelection: false }).run();
  editor.commands.setTextSelection(at + 2);
  return at;
}

/** The card nodes inside the content block of the section at `index` in `side`. */
function cardsInSection(
  editor: Editor,
  side: "aff" | "neg",
  index: number,
): ProseMirrorNode[] {
  const { from, to } = getSectionRange(editor, side, index);
  const cards: ProseMirrorNode[] = [];
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === CARD_NODE_NAME) cards.push(node);
    return true;
  });
  return cards;
}

/** The top-level section node-type names, proving the enforced doc shape holds. */
function topLevelSections(editor: Editor): string[] {
  const names: string[] = [];
  editor.state.doc.forEach((child) => names.push(child.type.name));
  return names;
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

describe("send-to-block-file operations", () => {
  describe("listSendDestinations", () => {
    it("lists every argument section across both sides with its side and label", async () => {
      const editor = await openEditor("dest-list");
      addSection(editor, "aff", "AT: Gold");
      addSection(editor, "aff", "AT: Fusion");
      addSection(editor, "neg", "AT: Warming");

      expect(listSendDestinations(editor)).toEqual([
        { side: "aff", index: 0, label: "AT: Gold" },
        { side: "aff", index: 1, label: "AT: Fusion" },
        { side: "neg", index: 0, label: "AT: Warming" },
      ]);
    });

    it("returns an empty list when neither side has a section", async () => {
      const editor = await openEditor("dest-empty");
      expect(listSendDestinations(editor)).toEqual([]);
    });
  });

  describe("sendSelectedCard - copy", () => {
    it("copies the selected card into the destination section, leaving the source intact", async () => {
      const editor = await openEditor("copy");
      addSection(editor, "aff", "AT: Gold"); // index 0, source
      addSection(editor, "neg", "AT: Warming"); // dest
      seedSelectedCard(editor, "aff", 0, markedCard("T", "Warming is real"));

      const result = sendSelectedCard(
        editor,
        { side: "neg", index: 0 },
        "copy",
      );

      expect(result).toEqual({
        side: "neg",
        index: 0,
        label: "AT: Warming",
        mode: "copy",
      });
      // Source still holds its card; destination now has a copy.
      expect(cardsInSection(editor, "aff", 0)).toHaveLength(1);
      expect(cardsInSection(editor, "neg", 0)).toHaveLength(1);
    });
  });

  describe("sendSelectedCard - move", () => {
    it("moves the selected card into the destination section, removing the source", async () => {
      const editor = await openEditor("move");
      addSection(editor, "aff", "AT: Gold");
      addSection(editor, "neg", "AT: Warming");
      seedSelectedCard(editor, "aff", 0, markedCard("T", "Warming is real"));

      const result = sendSelectedCard(
        editor,
        { side: "neg", index: 0 },
        "move",
      );

      expect(result?.mode).toBe("move");
      expect(cardsInSection(editor, "aff", 0)).toHaveLength(0);
      expect(cardsInSection(editor, "neg", 0)).toHaveLength(1);
    });
  });

  it("preserves the card's anatomy and marks on insertion", async () => {
    const editor = await openEditor("marks");
    addSection(editor, "aff", "AT: Gold");
    addSection(editor, "neg", "AT: Warming");
    seedSelectedCard(editor, "aff", 0, markedCard("NU", "No uniqueness"));

    sendSelectedCard(editor, { side: "neg", index: 0 }, "copy");

    const [landed] = cardsInSection(editor, "neg", 0);
    const json = landed.toJSON() as JSONContent;
    // Four regions in order.
    expect((json.content ?? []).map((n) => n.type)).toEqual([
      "cardTag",
      "cardTagline",
      "cardCite",
      "cardBody",
    ]);
    // Header regions survive as typed.
    expect(landed.textContent).toContain("NU");
    expect(landed.textContent).toContain("No uniqueness");
    expect(landed.textContent).toContain("Smith 24");
    // Body marks survive: a bold run and a highlight run.
    const bodyText = JSON.stringify(json.content?.[3]);
    expect(bodyText).toContain("bold");
    expect(bodyText).toContain("highlight");
  });

  it("keeps the enforced two-section document shape after a move", async () => {
    const editor = await openEditor("shape");
    addSection(editor, "aff", "AT: Gold");
    addSection(editor, "neg", "AT: Warming");
    seedSelectedCard(editor, "aff", 0, markedCard("T", "x"));

    sendSelectedCard(editor, { side: "neg", index: 0 }, "move");

    expect(topLevelSections(editor)).toEqual(["affSection", "negSection"]);
  });

  it("persists the inserted card - it survives a reload through a fresh handle", async () => {
    const editor = await openEditor("persist");
    addSection(editor, "aff", "AT: Gold");
    addSection(editor, "neg", "AT: Warming");
    seedSelectedCard(editor, "aff", 0, markedCard("T", "Persisted tagline"));
    sendSelectedCard(editor, { side: "neg", index: 0 }, "copy");

    // Let the local write settle, then reopen the same backend fresh.
    await new Promise((r) => setTimeout(r, 20));
    const reopened = await openEditor("persist");
    const [landed] = cardsInSection(reopened, "neg", 0);
    expect(landed).toBeDefined();
    expect(landed.textContent).toContain("Persisted tagline");
  });

  it("returns null and changes nothing when no card is selected", async () => {
    const editor = await openEditor("no-card");
    addSection(editor, "neg", "AT: Warming");
    // Caret is not inside a card.
    const before = editor.getJSON();

    const result = sendSelectedCard(
      editor,
      { side: "neg", index: 0 },
      "copy",
    );

    expect(result).toBeNull();
    expect(editor.getJSON()).toEqual(before);
  });

  it("throws when the destination section index is out of range", async () => {
    const editor = await openEditor("bad-index");
    addSection(editor, "aff", "AT: Gold");
    seedSelectedCard(editor, "aff", 0, markedCard("T", "x"));

    expect(() =>
      sendSelectedCard(editor, { side: "neg", index: 0 }, "copy"),
    ).toThrow();
  });
});
