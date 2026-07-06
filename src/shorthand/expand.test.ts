/**
 * Behavioural tests for the shorthand **expansion engine**.
 *
 * Two layers, matching the module:
 *  - the pure {@link expandText} over plain strings (whole-token correctness,
 *    substrings/partials untouched, no-op cases);
 *  - {@link expandCompletedText} / {@link expandThen} driven over a *real* Tiptap
 *    editor bound to a real flow-sheet fragment - the exact argument-row
 *    composition the contention / subpoint surfaces ship - proving expansion runs
 *    over just-completed text *exactly at the transition trigger*, not per
 *    keystroke, and preserves surrounding text and marks.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  argumentRowExtensions,
  argumentRowKeymap,
  newArgumentRow,
  newGroupedResponse,
} from "../flow/argument-rows";
import {
  expandText,
  expandCompletedText,
  expandThen,
  type ShorthandLookup,
} from "./expand";

/** A fixed lookup mirroring the dictionary's exact, case-sensitive contract. */
const DICT: Record<string, string> = {
  aff: "affirmative",
  neg: "negative",
  cx: "cross-examination",
  fw: "framework",
};
const lookup: ShorthandLookup = (token) => DICT[token];

describe("expandText (pure, whole-token)", () => {
  it("expands a whole-token abbreviation", () => {
    expect(expandText("aff", lookup).text).toBe("affirmative");
  });

  it("expands multiple tokens and preserves the separators between them", () => {
    expect(expandText("aff vs neg", lookup).text).toBe(
      "affirmative vs negative",
    );
  });

  it("leaves a substring inside a larger token untouched", () => {
    // "aff" is a substring of "affluent" but not a whole token.
    expect(expandText("affluent", lookup).text).toBe("affluent");
  });

  it("leaves a partial token (extra letters) untouched", () => {
    expect(expandText("affs", lookup).text).toBe("affs");
  });

  it("expands a token adjacent to punctuation (punctuation is a separator)", () => {
    expect(expandText("aff, neg.", lookup).text).toBe(
      "affirmative, negative.",
    );
  });

  it("does not expand across a wrong case (exact match only)", () => {
    expect(expandText("Aff", lookup).text).toBe("Aff");
  });

  it("reports no change when nothing matches", () => {
    const result = expandText("nothing here matches", lookup);
    expect(result.changed).toBe(false);
    expect(result.text).toBe("nothing here matches");
  });

  it("reports no change when the token already equals its expansion", () => {
    const idem: ShorthandLookup = (t) => (t === "same" ? "same" : undefined);
    expect(expandText("same", idem).changed).toBe(false);
  });

  it("is a no-op on empty text", () => {
    expect(expandText("", lookup)).toEqual({ text: "", changed: false });
  });
});

// ---------------------------------------------------------------------------
// Editor-level: the transition trigger.
// ---------------------------------------------------------------------------

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  handles = [];
  editors = [];
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
});

let nextId = 0;
const uniqueId = () => `flow-${Date.now()}-${nextId++}`;

async function openFlowSheet(): Promise<DocumentHandle> {
  const handle = openDocument({ id: uniqueId(), kind: "flow-sheet" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

/** The exact argument-row editor composition the flow surfaces ship. */
function openEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: "contention:test" },
    extensions: editorPreset({
      extensions: [...argumentRowExtensions, argumentRowKeymap],
    }),
  });
  editors.push(editor);
  return editor;
}

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

function argumentsOf(editor: Editor): JSONContent[] {
  return editor.getJSON().content ?? [];
}

describe("expandCompletedText (editor, at the transition)", () => {
  it("expands whole-token abbreviations in the just-completed block", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("aff outweighs neg").run();
    const changed = expandCompletedText(editor, lookup);

    expect(changed).toBe(true);
    expect(textOf(argumentsOf(editor)[0])).toBe(
      "affirmative outweighs negative",
    );
  });

  it("leaves substrings and non-abbreviations untouched", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("affs and affluent stay").run();
    const changed = expandCompletedText(editor, lookup);

    expect(changed).toBe(false);
    expect(textOf(argumentsOf(editor)[0])).toBe("affs and affluent stay");
  });

  it("expands only the block the caret is in, not sibling blocks", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    // First argument row "aff", a second row "neg" with the caret left in it.
    editor.chain().focus().insertContent("aff").run();
    newArgumentRow(editor);
    editor.chain().insertContent("neg").run();

    const changed = expandCompletedText(editor, lookup);
    expect(changed).toBe(true);

    const args = argumentsOf(editor);
    // Only the second (current) row expanded.
    expect(textOf(args[0])).toBe("aff");
    expect(textOf(args[1])).toBe("negative");
  });

  it("preserves marks on surrounding text when expanding", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    // Bold "fw", plain " matters".
    editor
      .chain()
      .focus()
      .insertContent("plain ")
      .toggleBold()
      .insertContent("fw")
      .toggleBold()
      .insertContent(" matters")
      .run();

    const changed = expandCompletedText(editor, lookup);
    expect(changed).toBe(true);

    const html = editor.getHTML();
    expect(html).toContain("framework");
    // The expansion inherited the bold context of the token it replaced.
    expect(html).toMatch(/<strong>framework<\/strong>/);
    // Surrounding plain text is unchanged.
    expect(textOf(argumentsOf(editor)[0])).toBe("plain framework matters");
  });

  it("is a no-op (returns false, no dispatch) when nothing matches", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("no matches at all").run();
    expect(expandCompletedText(editor, lookup)).toBe(false);
    expect(textOf(argumentsOf(editor)[0])).toBe("no matches at all");
  });
});

describe("expandThen (the transition composition seam)", () => {
  it("expands the just-completed row, then runs the surface transition", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("aff outweighs").run();
    // The exact seam a surface uses: expand the finished row, then split.
    const transitioned = expandThen(editor, lookup, newArgumentRow);
    expect(transitioned).toBe(true);
    editor.chain().insertContent("neg concedes").run();

    const args = argumentsOf(editor);
    expect(args).toHaveLength(2);
    // The completed row was expanded at the transition...
    expect(textOf(args[0])).toBe("affirmative outweighs");
    // ...and the freshly typed row is not (it is not yet completed).
    expect(textOf(args[1])).toBe("neg concedes");
  });

  it("composes with Shift+Enter (grouped response) too", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("cx checks").run();
    const transitioned = expandThen(editor, lookup, newGroupedResponse);
    expect(transitioned).toBe(true);

    const responses = argumentsOf(editor)[0].content ?? [];
    expect(responses).toHaveLength(2);
    expect(textOf(responses[0])).toBe("cross-examination checks");
  });

  it("still runs the transition when nothing expanded", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("no shorthand").run();
    expect(expandThen(editor, lookup, newArgumentRow)).toBe(true);
    expect(argumentsOf(editor)).toHaveLength(2);
  });
});
