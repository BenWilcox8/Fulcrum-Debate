/**
 * Behavioral tests for the Extract Highlight card-cutting tool.
 *
 * Extract Highlight isolates the read-aloud rhetoric out of a dense card: it
 * collects only the highlighted runs of the card the caret is in and inserts a
 * fresh card immediately after the source, whose body holds just that highlighted
 * content (marks preserved) - leaving the source card completely intact. These
 * tests drive a real block-file + card editor (the same `fake-indexeddb` harness
 * the other tool suites use) and assert on the resulting document structure/marks
 * and the toolbar's rendered enablement - never on ProseMirror internals.
 *
 * Positions that drive the assertions come from an independent document walk,
 * never the command under test - the same discipline as `card-unit.test.ts`.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import { HIGHLIGHT_MARK_NAME } from "../../editor/marks";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  getSideRegion,
} from "../../blockfile";
import { createPreferenceStore } from "../../preferences";
import { createCardToolRegistry } from "../registry";
import { CardToolbar } from "../react/CardToolbar";
import {
  EXTRACT_HIGHLIGHT_TOOL_ID,
  EXTRACT_HIGHLIGHT_TOOL_LABEL,
  canExtractHighlight,
  extractHighlight,
  extractHighlightTool,
} from "./extractHighlightTool";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  editors = [];
  handles = [];
});

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

interface Run {
  text: string;
  marks?: JSONContent["marks"];
}

function hl(...extra: NonNullable<JSONContent["marks"]>): JSONContent["marks"] {
  return [{ type: HIGHLIGHT_MARK_NAME }, ...extra];
}

function cardWith(
  paragraphs: Run[][],
  fields?: { tag?: string; tagline?: string; cite?: string },
): JSONContent {
  const textRegion = (type: string, text?: string): JSONContent =>
    text ? { type, content: [{ type: "text", text }] } : { type };
  return {
    type: "card",
    content: [
      textRegion("cardTag", fields?.tag ?? "T"),
      textRegion("cardTagline", fields?.tagline),
      textRegion("cardCite", fields?.cite),
      {
        type: "cardBody",
        content: paragraphs.map((runs) => ({
          type: "paragraph",
          content: runs.map((r) => ({
            type: "text",
            text: r.text,
            ...(r.marks ? { marks: r.marks } : {}),
          })),
        })),
      },
    ],
  };
}

/** Insert a card into the aff side; returns nothing (position via walk). */
function insertCard(
  editor: Editor,
  paragraphs: Run[][],
  fields?: { tag?: string; tagline?: string; cite?: string },
): void {
  const at = getSideRegion(editor, "aff").contentEnd;
  editor
    .chain()
    .insertContentAt(at, cardWith(paragraphs, fields), { updateSelection: false })
    .run();
}

/** Independent walk: every `card` node with its start position, in order. */
function cards(editor: Editor): { node: ProseMirrorNode; pos: number }[] {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "card") {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
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

/** Put the caret inside the first card body. */
function caretInFirstBody(editor: Editor): void {
  let target: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (target === null && node.type.name === "cardBody") {
      target = pos + 2;
      return false;
    }
    return true;
  });
  if (target === null) throw new Error("no cardBody in document");
  editor.commands.setTextSelection(target);
}

/** The text of a body region, per its child paragraphs. */
function paragraphTexts(body: ProseMirrorNode): string[] {
  const texts: string[] = [];
  body.forEach((p) => texts.push(p.textContent));
  return texts;
}

function countType(editor: Editor, name: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === name) count++;
  });
  return count;
}

describe("Extract Highlight tool", () => {
  it("yields a new card holding only the highlighted content, source intact", async () => {
    const editor = await openEditor("extract");
    insertCard(editor, [
      [
        { text: "Skip. " },
        { text: "Read this aloud.", marks: hl() },
        { text: " Skip too." },
      ],
    ]);
    caretInFirstBody(editor);

    expect(extractHighlight(editor)).toBe(true);

    const allCards = cards(editor);
    expect(allCards).toHaveLength(2);
    const [sourceBody, extractedBody] = bodies(editor);

    // Source card is completely intact.
    expect(sourceBody.textContent).toBe("Skip. Read this aloud. Skip too.");
    // The extracted card holds only the highlighted run.
    expect(extractedBody.textContent).toBe("Read this aloud.");
  });

  it("preserves inline marks on the extracted highlighted runs", async () => {
    const editor = await openEditor("marks");
    insertCard(editor, [
      [
        { text: "lead " },
        { text: "bold+read", marks: hl({ type: "bold" }) },
        { text: " tail" },
      ],
    ]);
    caretInFirstBody(editor);

    extractHighlight(editor);

    const extractedBody = bodies(editor)[1];
    const marks: string[][] = [];
    extractedBody.descendants((n) => {
      if (n.isText) marks.push(n.marks.map((m) => m.type.name).sort());
    });
    expect(marks).toContainEqual([HIGHLIGHT_MARK_NAME, "bold"].sort());
    expect(extractedBody.textContent).toBe("bold+read");
  });

  it("keeps one paragraph per source paragraph that has highlighted runs", async () => {
    const editor = await openEditor("paragraphs");
    insertCard(editor, [
      [{ text: "one ", marks: hl() }, { text: "plain" }],
      [{ text: "nothing highlighted here" }],
      [{ text: "two", marks: hl() }],
    ]);
    caretInFirstBody(editor);

    extractHighlight(editor);

    const extractedBody = bodies(editor)[1];
    // Paragraph 2 had no highlights, so it is dropped; 1 and 3 survive.
    expect(paragraphTexts(extractedBody)).toEqual(["one ", "two"]);
  });

  it("carries the source card's tag/tagline/cite onto the extracted card", async () => {
    const editor = await openEditor("fields");
    insertCard(
      editor,
      [[{ text: "read", marks: hl() }]],
      { tag: "NU", tagline: "No uniqueness", cite: "Smith 24" },
    );
    caretInFirstBody(editor);

    extractHighlight(editor);

    const extracted = cards(editor)[1].node;
    const regionText: Record<string, string> = {};
    extracted.forEach((child) => {
      regionText[child.type.name] = child.textContent;
    });
    expect(regionText.cardTag).toBe("NU");
    expect(regionText.cardTagline).toBe("No uniqueness");
    expect(regionText.cardCite).toBe("Smith 24");
  });

  it("respects card boundaries: extracts only from the addressed card", async () => {
    const editor = await openEditor("boundary");
    const at = getSideRegion(editor, "aff").contentEnd;
    editor
      .chain()
      .insertContentAt(
        at,
        [
          cardWith([[{ text: "A-read", marks: hl() }]], { tag: "A" }),
          cardWith([[{ text: "B-read", marks: hl() }]], { tag: "B" }),
        ],
        { updateSelection: false },
      )
      .run();
    expect(countType(editor, "card")).toBe(2);

    // Caret in the *first* card only.
    caretInFirstBody(editor);
    extractHighlight(editor);

    const allCards = cards(editor);
    expect(allCards).toHaveLength(3);
    // The extracted card is inserted right after the first (source) card.
    const bodyTexts = bodies(editor).map((b) => b.textContent);
    expect(bodyTexts).toEqual(["A-read", "A-read", "B-read"]);
  });

  it("is a no-op returning false when the card has no highlighted runs", async () => {
    const editor = await openEditor("none");
    insertCard(editor, [[{ text: "nothing highlighted" }]]);
    caretInFirstBody(editor);

    expect(canExtractHighlight(editor)).toBe(false);
    expect(extractHighlight(editor)).toBe(false);
    expect(countType(editor, "card")).toBe(1);
  });

  it("reports extractable only when the addressed card has highlighted runs", async () => {
    const editor = await openEditor("can");
    insertCard(editor, [[{ text: "plain " }, { text: "read", marks: hl() }]]);

    // Caret outside any card: not extractable.
    editor.commands.setTextSelection(1);
    expect(canExtractHighlight(editor)).toBe(false);

    // Caret in the card body: extractable.
    caretInFirstBody(editor);
    expect(canExtractHighlight(editor)).toBe(true);
  });

  it("exposes the tool definition with a schema and an enablement predicate", () => {
    expect(extractHighlightTool.id).toBe(EXTRACT_HIGHLIGHT_TOOL_ID);
    expect(extractHighlightTool.label).toBe(EXTRACT_HIGHLIGHT_TOOL_LABEL);
    expect(extractHighlightTool.settings).toBeDefined();
    expect(typeof extractHighlightTool.isEnabled).toBe("function");
  });

  it("registers into the toolbar, disabled until the card has a highlighted run", async () => {
    const editor = await openEditor("toolbar");
    insertCard(editor, [[{ text: "plain " }, { text: "read", marks: hl() }]]);

    const registry = createCardToolRegistry(createPreferenceStore());
    registry.register(extractHighlightTool);
    render(<CardToolbar editor={editor} tools={registry.list()} />);

    const button = screen.getByRole("button", {
      name: EXTRACT_HIGHLIGHT_TOOL_LABEL,
    });

    // Caret outside any card: disabled.
    act(() => {
      editor.commands.setTextSelection(1);
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");

    // Caret in the highlighted card: enabled.
    act(() => {
      caretInFirstBody(editor);
    });
    expect(button).toBeEnabled();

    // Clicking extracts a second card.
    fireEvent.click(button);
    expect(countType(editor, "card")).toBe(2);
  });
});
