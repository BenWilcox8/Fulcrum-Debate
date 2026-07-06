/**
 * Whole-stack end-to-end proof for the **Card-Cutting Tools** PRD (its 6/6
 * closeout) - the five real tools that ship on the toolbar framework, exercised
 * *together* on one card the way a debater actually cuts it, with no mocks:
 *
 *   - **Highlight** (`highlightCardTool`) - toggles the shared highlight mark on
 *     the selection to mark the read-aloud runs.
 *   - **Extract Highlight** (`extractHighlightTool`) - copies just those
 *     highlighted runs into a fresh sibling card, source left intact.
 *   - **Shrink** (`shrinkCardTool`) - drives the *un-highlighted* body runs of the
 *     card down the size cycle, leaving the read-aloud runs alone.
 *   - **Condense** (`condenseTool`) - joins the card body's paragraphs into one
 *     block, preserving every inline mark (highlight + the shrunk font size).
 *   - **Send to Block File** (`sendSelectedCard`) - files the finished card into a
 *     chosen argument section (its `applyToSelection` is a deliberate no-op, so the
 *     move is driven through the same pure op the real custom control uses).
 *
 * The four in-place tools are registered on one `createCardToolRegistry`, rendered
 * through the real `CardToolbar`, and driven via the registry's `apply` seam (which
 * reads each tool's live settings and runs its `applyToSelection`), so this spans
 * the whole registration contract as well as the individual operations. The editor
 * is the exact block-file + card preset the Block File screen ships. A fresh
 * IndexedDB backend per test isolates them; reopening the same document at the end
 * proves the pipeline's result persisted. Positions that drive the assertions come
 * from an independent document walk, never the tool under test - the same discipline
 * as `card-unit.test.ts` / `extractHighlightTool.test.tsx`.
 *
 * Follows the `tools.e2e` (framework) / `card.e2e` / `formatting.e2e` closeout
 * precedent; where `tools.e2e` proves the *framework* seam end to end, this proves
 * the *tools themselves* compose correctly on a single card.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { highlightedRuns, hasHighlightedRuns } from "../editor/marks";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  cardCreate,
  addSection,
  getSectionRange,
  getSideRegion,
  CARD_NODE_NAME,
} from "../blockfile";
import {
  openPreferenceStore,
  type PersistentPreferenceStore,
} from "../preferences";
import {
  createCardToolRegistry,
  condenseTool,
  extractHighlightTool,
  highlightCardTool,
  shrinkCardTool,
  sendToBlockFileTool,
  sendSelectedCard,
  EXTRACT_HIGHLIGHT_TOOL_LABEL,
  CONDENSE_TOOL_LABEL,
} from ".";
import { CardToolbar } from "./react/CardToolbar";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];
let stores: PersistentPreferenceStore[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  cleanup();
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  for (const store of stores) await store.close();
  editors = [];
  handles = [];
  stores = [];
});

async function openHandle(id: string): Promise<DocumentHandle> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

function openEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    // The exact preset the Block File screen ships: side schema + card node model
    // + quick-create binding.
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions, cardCreate],
    }),
  });
  editors.push(editor);
  return editor;
}

/**
 * A card whose body is two paragraphs, each a plain lead / a to-be-read-aloud
 * middle / a plain trailing run - the middles are what the debater highlights, the
 * rest is what Shrink drives down. No highlight marks are seeded; the Highlight
 * *tool* creates them.
 */
function seedCard(editor: Editor): void {
  const at = getSideRegion(editor, "aff").contentEnd;
  const card: JSONContent = {
    type: CARD_NODE_NAME,
    content: [
      { type: "cardTag", content: [{ type: "text", text: "T" }] },
      { type: "cardTagline", content: [{ type: "text", text: "Warming is real" }] },
      { type: "cardCite", content: [{ type: "text", text: "Smith 24" }] },
      {
        type: "cardBody",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Intro one. " },
              { type: "text", text: "Read this aloud." },
              { type: "text", text: " Trailing one." },
            ],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Second intro. " },
              { type: "text", text: "Read this too." },
              { type: "text", text: " Trailing two." },
            ],
          },
        ],
      },
    ],
  };
  editor
    .chain()
    .insertContentAt(at, card, { updateSelection: false })
    .run();
}

/** Run an editor mutation inside `act` (the toolbar re-renders on transactions). */
function act1<T>(fn: () => T): T {
  let result!: T;
  act(() => {
    result = fn();
  });
  return result;
}

/**
 * Select the exact `substring` wherever it first appears in the document, by
 * offset within the enclosing text node. (Adjacent unmarked runs merge into one
 * text node, so a substring is the faithful way to address a run before it has
 * been split out by a mark.)
 */
function selectText(editor: Editor, substring: string): void {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range) return false;
    if (node.isText && node.text && node.text.includes(substring)) {
      const offset = node.text.indexOf(substring);
      range = { from: pos + offset, to: pos + offset + substring.length };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`selectText: no run containing "${substring}"`);
  editor.commands.setTextSelection(range);
}

/** The `fontSize` on the first run whose text is exactly `text`, or null. */
function sizeOf(editor: Editor, text: string): string | null {
  const textStyle = editor.state.schema.marks.textStyle;
  let size: string | null = null;
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    if (node.isText && node.text === text) {
      const mark = node.marks.find((m) => m.type.name === textStyle.name);
      const value = mark?.attrs.fontSize;
      size = typeof value === "string" ? value : null;
      found = true;
      return false;
    }
    return true;
  });
  return size;
}

/** Every `cardBody` node in document order. */
function bodies(editor: Editor): ProseMirrorNode[] {
  const found: ProseMirrorNode[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "cardBody") {
      found.push(node);
      return false;
    }
    return true;
  });
  return found;
}

/** The first `cardBody` node with its document position. */
function firstBody(editor: Editor): { node: ProseMirrorNode; pos: number } {
  let res: { node: ProseMirrorNode; pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (res) return false;
    if (node.type.name === "cardBody") {
      res = { node, pos };
      return false;
    }
    return true;
  });
  if (!res) throw new Error("no cardBody in document");
  return res;
}

/** A selection spanning the first card body's first..last paragraph content. */
function firstBodyParagraphSpan(editor: Editor): { from: number; to: number } {
  const { node, pos } = firstBody(editor);
  const from = pos + 2; // into the first paragraph's content
  let offset = pos + 1;
  let to = from;
  node.forEach((child) => {
    to = offset + child.nodeSize - 1; // inner end of the last child seen
    offset += child.nodeSize;
  });
  return { from, to };
}

/** The paragraph texts of a body region. */
function paragraphTexts(body: ProseMirrorNode): string[] {
  const texts: string[] = [];
  body.forEach((p) => texts.push(p.textContent));
  return texts;
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

/** The first direct child of `node` with the given node-type name. */
function childOfType(node: ProseMirrorNode, name: string): ProseMirrorNode {
  let found: ProseMirrorNode | null = null;
  node.forEach((child) => {
    if (!found && child.type.name === name) found = child;
  });
  if (!found) throw new Error(`no ${name} child`);
  return found;
}

/** Whether any text run inside `node` carries an 8pt font-size mark. */
function hasSize(node: ProseMirrorNode, size: string): boolean {
  let match = false;
  node.descendants((n) => {
    if (match) return false;
    if (n.isText) {
      const mark = n.marks.find((m) => m.type.name === "textStyle");
      if (mark?.attrs.fontSize === size) match = true;
    }
    return true;
  });
  return match;
}

const DOC_ID = "card-cutting-tools-e2e";

describe("card-cutting tools end-to-end", () => {
  it("flows one card through highlight -> extract -> shrink -> condense -> send", async () => {
    const editor = openEditor(await openHandle(DOC_ID));
    act1(() => seedCard(editor));

    // One persistent store shared by every tool's settings section.
    const store = openPreferenceStore();
    stores.push(store);
    await store.whenLoaded;

    // Register the four in-place tools on one registry and render the real
    // toolbar over them; Send is exercised through its pure op (its
    // applyToSelection is a deliberate no-op).
    const registry = createCardToolRegistry(store);
    const highlight = registry.register(highlightCardTool);
    const extract = registry.register(extractHighlightTool);
    const shrink = registry.register(shrinkCardTool);
    const condense = registry.register(condenseTool);
    registry.register(sendToBlockFileTool);

    render(<CardToolbar editor={editor} tools={registry.list()} />);
    const toolbar = screen.getByRole("toolbar", { name: /card tools/i });
    const extractButton = within(toolbar).getByRole("button", {
      name: EXTRACT_HIGHLIGHT_TOOL_LABEL,
    });
    const condenseButton = within(toolbar).getByRole("button", {
      name: CONDENSE_TOOL_LABEL,
    });

    // --- 1) Highlight: the card has no highlighted runs yet, so Extract is
    //        disabled even with the caret in the card. ------------------------
    act1(() => selectText(editor, "Intro one."));
    expect(extractButton).toBeDisabled();

    expect(act1(() => (selectText(editor, "Read this aloud."), highlight.apply(editor)))).toBe(true);
    expect(act1(() => (selectText(editor, "Read this too."), highlight.apply(editor)))).toBe(true);

    // Exactly the two read-aloud middles are now highlighted, in order.
    expect(highlightedRuns(firstBody(editor).node).map((r) => r.text)).toEqual([
      "Read this aloud.",
      "Read this too.",
    ]);
    // ...and Extract is now enabled (caret is in a highlighted card).
    expect(extractButton).toBeEnabled();

    // --- 2) Extract: a fresh sibling card of just the highlighted runs, source
    //        completely intact. --------------------------------------------------
    expect(act1(() => extract.apply(editor))).toBe(true);
    const [sourceBody, extractedBody] = bodies(editor);
    expect(bodies(editor)).toHaveLength(2);
    expect(paragraphTexts(extractedBody)).toEqual([
      "Read this aloud.",
      "Read this too.",
    ]);
    expect(paragraphTexts(sourceBody)).toEqual([
      "Intro one. Read this aloud. Trailing one.",
      "Second intro. Read this too. Trailing two.",
    ]);

    // --- 3) Shrink: only the source card's un-highlighted body runs shrink (to
    //        the first cycle size, 8pt); the read-aloud runs stay at reading size.
    expect(act1(() => shrink.apply(editor))).toBe(true);
    expect(sizeOf(editor, "Intro one. ")).toBe("8pt");
    expect(sizeOf(editor, " Trailing one.")).toBe("8pt");
    expect(sizeOf(editor, " Trailing two.")).toBe("8pt");
    // The highlighted (spoken) run is never shrunk.
    expect(sizeOf(editor, "Read this aloud.")).toBeNull();

    // --- 4) Condense: join the source body's two paragraphs into one block,
    //        preserving both the highlight marks and the shrunk font size. -------
    act1(() => editor.commands.setTextSelection(firstBodyParagraphSpan(editor)));
    expect(condenseButton).toBeEnabled();
    expect(act1(() => condense.apply(editor))).toBe(true);

    expect(firstBody(editor).node.childCount).toBe(1);
    // Marks survived the merge: both highlighted runs, and the 8pt shrink.
    expect(highlightedRuns(firstBody(editor).node).map((r) => r.text)).toEqual([
      "Read this aloud.",
      "Read this too.",
    ]);
    expect(sizeOf(editor, "Intro one. ")).toBe("8pt");

    // --- 5) Send: file the finished card into a new neg argument section. The
    //        Send tool's applyToSelection is a no-op, so drive the same pure op
    //        the real custom control uses. Move relocates the finished card. -----
    act1(() => addSection(editor, "neg", "AT: Warming"));
    // Adding the section can move the selection into the new heading; put the
    // caret back in the finished source card so `getSelectedCard` resolves it.
    act1(() => selectText(editor, "Intro one."));
    const result = act1(() =>
      sendSelectedCard(editor, { side: "neg", index: 0 }, "move"),
    );
    expect(result).toMatchObject({ side: "neg", index: 0, label: "AT: Warming", mode: "move" });

    const landed = cardsInSection(editor, "neg", 0);
    expect(landed).toHaveLength(1);
    // Only the extracted card and the moved card remain (source was relocated).
    let totalCards = 0;
    editor.state.doc.descendants((n) => {
      if (n.type.name === CARD_NODE_NAME) totalCards++;
    });
    expect(totalCards).toBe(2);

    // The landed card is the full pipeline result: condensed to one paragraph,
    // still carrying the highlight marks and the 8pt shrink.
    const landedBody = childOfType(landed[0], "cardBody");
    expect(landedBody.childCount).toBe(1);
    expect(hasHighlightedRuns(landedBody)).toBe(true);
    expect(hasSize(landedBody, "8pt")).toBe(true);

    // --- 6) Persistence: the pipeline's result survives a reopen over the same
    //        IndexedDB backend. ---------------------------------------------------
    cleanup();
    await new Promise((r) => setTimeout(r, 20));
    const reopened = openEditor(await openHandle(DOC_ID));
    const reLanded = cardsInSection(reopened, "neg", 0);
    expect(reLanded).toHaveLength(1);
    const reBody = childOfType(reLanded[0], "cardBody");
    expect(reBody.childCount).toBe(1);
    expect(hasHighlightedRuns(reBody)).toBe(true);
    expect(hasSize(reBody, "8pt")).toBe(true);
  });
});
