/**
 * Behavioral tests for the shared highlighted-runs query.
 *
 * `highlightedRuns` is the reusable primitive the Extract Highlight tool and the
 * Auto Speech pipeline both build on: given a ProseMirror node, it returns the
 * runs of text carrying the highlight mark - the read-aloud rhetoric a debater
 * cuts out of a dense paragraph. These tests drive a real block-file + card
 * editor (the same `fake-indexeddb` harness the tool suites use) and assert on the
 * returned runs (text, re-insertable content, positions) - never on ProseMirror
 * internals of the walk.
 *
 * Node positions that drive the assertions come from an independent document walk,
 * never the query under test - the same discipline as `card-unit.test.ts`.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../core";
import { editorPreset } from "../preset";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  getSideRegion,
} from "../../blockfile";
import {
  HIGHLIGHT_MARK_NAME,
  hasHighlightedRuns,
  highlightedRuns,
} from "./index";

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

/** A `{ type: "highlight" }` mark, optionally combined with other marks. */
function hl(...extra: NonNullable<JSONContent["marks"]>): JSONContent["marks"] {
  return [{ type: HIGHLIGHT_MARK_NAME }, ...extra];
}

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

function insertCard(editor: Editor, paragraphs: Run[][]): void {
  const at = getSideRegion(editor, "aff").contentEnd;
  editor
    .chain()
    .insertContentAt(at, cardWith(paragraphs), { updateSelection: false })
    .run();
}

/** Independent walk: the first `cardBody` node with its start position. */
function firstBody(editor: Editor): { node: ProseMirrorNode; pos: number } {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.type.name === "cardBody") {
      found = { node, pos };
      return false;
    }
    return true;
  });
  if (!found) throw new Error("no cardBody in document");
  return found;
}

/** The mark type names on an inline JSON node. */
function markNames(node: JSONContent): string[] {
  return (node.marks ?? []).map((m) => m.type);
}

describe("highlightedRuns", () => {
  it("returns only the highlighted runs from a mixed paragraph", async () => {
    const editor = await openEditor("mixed");
    insertCard(editor, [
      [
        { text: "Skip this. " },
        { text: "Read this", marks: hl() },
        { text: " but not this." },
      ],
    ]);
    const { node } = firstBody(editor);

    const runs = highlightedRuns(node);

    expect(runs.map((r) => r.text)).toEqual(["Read this"]);
  });

  it("preserves each run's inline marks in its re-insertable content", async () => {
    const editor = await openEditor("marks");
    insertCard(editor, [
      [
        { text: "plain " },
        { text: "bold+read", marks: hl({ type: "bold" }) },
      ],
    ]);
    const { node } = firstBody(editor);

    const [run] = highlightedRuns(node);

    expect(run.content).toHaveLength(1);
    expect(run.content[0].text).toBe("bold+read");
    expect(markNames(run.content[0]).sort()).toEqual(
      [HIGHLIGHT_MARK_NAME, "bold"].sort(),
    );
  });

  it("merges contiguous highlighted text nodes into one run, splitting across paragraphs", async () => {
    const editor = await openEditor("merge");
    insertCard(editor, [
      [
        // Two adjacent highlighted runs (different extra marks) - one logical run.
        { text: "first ", marks: hl() },
        { text: "second", marks: hl({ type: "bold" }) },
      ],
      [{ text: "third", marks: hl() }],
    ]);
    const { node } = firstBody(editor);

    const runs = highlightedRuns(node);

    // Paragraph 1's two contiguous highlighted nodes merge; paragraph 2 is its own
    // run (a paragraph boundary breaks contiguity).
    expect(runs.map((r) => r.text)).toEqual(["first second", "third"]);
    expect(runs[0].content).toHaveLength(2);
  });

  it("offsets run positions by basePos so a caller gets absolute doc positions", async () => {
    const editor = await openEditor("pos");
    insertCard(editor, [[{ text: "read", marks: hl() }]]);
    const { node, pos } = firstBody(editor);

    // Position immediately inside the body node (its first content position).
    const runs = highlightedRuns(node, pos + 1);
    const [run] = runs;

    // The run's absolute range must contain the same highlighted text in the doc.
    expect(editor.state.doc.textBetween(run.from, run.to)).toBe("read");
  });

  it("returns an empty list when nothing is highlighted", async () => {
    const editor = await openEditor("none");
    insertCard(editor, [[{ text: "all plain text" }]]);
    const { node } = firstBody(editor);

    expect(highlightedRuns(node)).toEqual([]);
    expect(hasHighlightedRuns(node)).toBe(false);
  });

  it("hasHighlightedRuns is true when any run is highlighted", async () => {
    const editor = await openEditor("has");
    insertCard(editor, [[{ text: "plain " }, { text: "read", marks: hl() }]]);
    const { node } = firstBody(editor);

    expect(hasHighlightedRuns(node)).toBe(true);
  });
});
