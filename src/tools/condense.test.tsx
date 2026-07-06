/**
 * Behavioral tests for the Condense card-cutting tool.
 *
 * Condense collapses the multiple paragraphs a debater selects inside a card
 * body into a single running block of text, preserving every inline mark
 * (bold, highlight, font size) so the card reads as one unit. These tests drive
 * a real block-file + card editor (the same `fake-indexeddb` harness the other
 * tool suites use) and assert on the resulting document structure/marks and the
 * toolbar's rendered enablement - never ProseMirror internals of the command.
 *
 * Positions that drive the assertions come from an independent document walk
 * (`findBody`/`bodies`), never the command under test - the same discipline as
 * `card-unit.test.ts`.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  getSideRegion,
} from "../blockfile";
import { createPreferenceStore } from "../preferences";
import { createCardToolRegistry } from "./registry";
import { CardToolbar } from "./react/CardToolbar";
import {
  CONDENSE_TOOL_ID,
  CONDENSE_TOOL_LABEL,
  canCondenseSelection,
  condenseSelection,
  condenseTool,
} from "./condense";

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

/** One inline run in a test paragraph: some text, optionally carrying marks. */
interface Run {
  text: string;
  marks?: JSONContent["marks"];
}

/** Build a card node whose body holds one paragraph per run-list, in order. */
function cardWith(paragraphs: Run[][]): JSONContent {
  return {
    type: "card",
    content: [
      { type: "cardTag", content: [{ type: "text", text: "T" }] },
      { type: "cardTagline" },
      { type: "cardCite" },
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

/** Insert a card into the aff side; returns the position just before it. */
function insertCard(editor: Editor, paragraphs: Run[][]): number {
  const at = getSideRegion(editor, "aff").contentEnd;
  editor
    .chain()
    .insertContentAt(at, cardWith(paragraphs), { updateSelection: false })
    .run();
  return at;
}

/** Independent walk: every `cardBody` node with its start position, in order. */
function bodies(editor: Editor): { node: ProseMirrorNode; pos: number }[] {
  const found: { node: ProseMirrorNode; pos: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "cardBody") {
      found.push({ node, pos });
      return false;
    }
    return true;
  });
  return found;
}

/** The first `cardBody` node (the common single-card case). */
function findBody(editor: Editor): { node: ProseMirrorNode; pos: number } {
  const all = bodies(editor);
  if (all.length === 0) throw new Error("no cardBody in document");
  return all[0];
}

/** Select a text range spanning every paragraph of a body (from its pos). */
function selectBody(editor: Editor, pos: number, node: ProseMirrorNode): void {
  editor.commands.setTextSelection({ from: pos + 2, to: pos + node.nodeSize - 2 });
}

/** Count nodes of a given type in the document. */
function countType(editor: Editor, name: string): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === name) count++;
  });
  return count;
}

describe("Condense tool", () => {
  it("merges the N selected paragraphs of a card body into one block", async () => {
    const editor = await openEditor("merge");
    insertCard(editor, [
      [{ text: "First." }],
      [{ text: "Second." }],
      [{ text: "Third." }],
    ]);
    const { node, pos } = findBody(editor);
    expect(node.childCount).toBe(3);
    selectBody(editor, pos, node);

    expect(condenseSelection(editor)).toBe(true);

    const body = findBody(editor).node;
    expect(body.childCount).toBe(1);
    expect(body.textContent).toBe("First.Second.Third.");
  });

  it("preserves every inline mark (bold, highlight, font size) through the merge", async () => {
    const editor = await openEditor("marks");
    insertCard(editor, [
      [
        { text: "Claim", marks: [{ type: "bold" }] },
        { text: " plain" },
      ],
      [
        { text: "read", marks: [{ type: "highlight" }] },
        { text: " " },
        {
          text: "tiny",
          marks: [{ type: "textStyle", attrs: { fontSize: "8pt" } }],
        },
      ],
    ]);
    const { node, pos } = findBody(editor);
    selectBody(editor, pos, node);

    condenseSelection(editor);

    const body = findBody(editor).node;
    expect(body.childCount).toBe(1);

    const boldTexts: string[] = [];
    const highlightTexts: string[] = [];
    let fontSize: unknown = null;
    body.descendants((n) => {
      if (!n.isText) return;
      const names = n.marks.map((m) => m.type.name);
      if (names.includes("bold")) boldTexts.push(n.text ?? "");
      if (names.includes("highlight")) highlightTexts.push(n.text ?? "");
      const ts = n.marks.find((m) => m.type.name === "textStyle");
      if (ts) fontSize = ts.attrs.fontSize;
    });
    expect(boldTexts).toContain("Claim");
    expect(highlightTexts).toContain("read");
    expect(fontSize).toBe("8pt");
  });

  it("is a no-op when the selection stays within a single paragraph", async () => {
    const editor = await openEditor("single");
    insertCard(editor, [[{ text: "Only one paragraph here." }]]);
    const { pos } = findBody(editor);
    editor.commands.setTextSelection({ from: pos + 2, to: pos + 6 });

    expect(canCondenseSelection(editor)).toBe(false);
    expect(condenseSelection(editor)).toBe(false);
    expect(findBody(editor).node.childCount).toBe(1);
  });

  it("reports condensable only when the selection spans multiple paragraphs", async () => {
    const editor = await openEditor("can");
    insertCard(editor, [[{ text: "One." }], [{ text: "Two." }]]);
    const { node, pos } = findBody(editor);

    // A collapsed caret inside the first paragraph is not condensable.
    editor.commands.setTextSelection(pos + 2);
    expect(canCondenseSelection(editor)).toBe(false);

    // A range spanning both paragraphs is.
    selectBody(editor, pos, node);
    expect(canCondenseSelection(editor)).toBe(true);
  });

  it("respects card boundaries, merging only within the addressed card body", async () => {
    const editor = await openEditor("boundary");
    const at = getSideRegion(editor, "aff").contentEnd;
    editor
      .chain()
      .insertContentAt(
        at,
        [
          cardWith([[{ text: "A-one." }], [{ text: "A-two." }]]),
          cardWith([[{ text: "B-only." }]]),
        ],
        { updateSelection: false },
      )
      .run();
    expect(countType(editor, "card")).toBe(2);

    const [first] = bodies(editor);
    selectBody(editor, first.pos, first.node);
    condenseSelection(editor);

    const after = bodies(editor);
    expect(after.length).toBe(2);
    // The first card's two paragraphs merged; the second card is untouched.
    expect(after[0].node.childCount).toBe(1);
    expect(after[0].node.textContent).toBe("A-one.A-two.");
    expect(after[1].node.childCount).toBe(1);
    expect(after[1].node.textContent).toBe("B-only.");
    expect(countType(editor, "card")).toBe(2);
  });

  it("exposes the Condense tool definition with a schema and an enablement predicate", () => {
    expect(condenseTool.id).toBe(CONDENSE_TOOL_ID);
    expect(condenseTool.label).toBe(CONDENSE_TOOL_LABEL);
    expect(condenseTool.settings).toBeDefined();
    expect(typeof condenseTool.isEnabled).toBe("function");
  });

  it("registers into the toolbar, disabled unless the selection spans multiple paragraphs", async () => {
    const editor = await openEditor("toolbar");
    insertCard(editor, [[{ text: "First." }], [{ text: "Second." }]]);

    const registry = createCardToolRegistry(createPreferenceStore());
    registry.register(condenseTool);
    render(<CardToolbar editor={editor} tools={registry.list()} />);

    const button = screen.getByRole("button", { name: CONDENSE_TOOL_LABEL });

    // Card is addressable but the caret sits in a single paragraph: disabled.
    act(() => {
      const { pos } = findBody(editor);
      editor.commands.setTextSelection(pos + 2);
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");

    // Selecting across both paragraphs enables it.
    act(() => {
      const { node, pos } = findBody(editor);
      selectBody(editor, pos, node);
    });
    expect(button).toBeEnabled();

    // Clicking condenses the body to one block.
    fireEvent.click(button);
    expect(findBody(editor).node.childCount).toBe(1);
  });
});
