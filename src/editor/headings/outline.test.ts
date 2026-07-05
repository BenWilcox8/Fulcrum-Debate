// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the document core persists through it. Tiptap itself needs only
// the jsdom DOM that the vitest environment already provides; no extra shim.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import Bold from "@tiptap/extension-bold";
import { openDocument } from "../../documents/core";
import { createEditor } from "../core";
import {
  heading,
  getOutline,
  observeOutline,
  HEADING_LEVELS,
  isHeadingLevel,
  type OutlineHeading,
} from "./index";

/**
 * Behavioral tests for heading support and the outline (ToC) seam: assertions
 * are made on the editor's public API, the resulting document JSON, and the
 * outline the query returns - never ProseMirror plugin internals.
 */

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `doc-${Date.now()}-${nextId++}`;

/** Opens a loaded document + a heading-capable editor on its `body` fragment. */
async function openHeadingEditor() {
  const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: "body" },
    extensions: [heading],
  });
  return { handle, editor };
}

/** Concise view of an outline for assertions: level + text only. */
const shape = (outline: OutlineHeading[]) =>
  outline.map(({ level, text }) => ({ level, text }));

describe("heading levels", () => {
  it("exposes the full 1-6 range", () => {
    expect([...HEADING_LEVELS]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(isHeadingLevel(1)).toBe(true);
    expect(isHeadingLevel(6)).toBe(true);
    expect(isHeadingLevel(0)).toBe(false);
    expect(isHeadingLevel(7)).toBe(false);
    expect(isHeadingLevel("2")).toBe(false);
  });

  it("applies headings of every supported level via the editor API", async () => {
    const { handle, editor } = await openHeadingEditor();

    for (const level of HEADING_LEVELS) {
      editor.commands.setContent(`<p>plain</p>`);
      editor.commands.selectAll();
      const ok = editor.commands.setHeading({ level });
      expect(ok).toBe(true);
      expect(editor.getJSON().content?.[0]).toMatchObject({
        type: "heading",
        attrs: { level },
      });
    }

    editor.destroy();
    await handle.close();
  });

  it("stores a heading in document JSON with a stable, asserted shape", async () => {
    const { handle, editor } = await openHeadingEditor();

    editor.commands.setContent("<h2>Contention One</h2>");

    // The persisted schema contract every ToC generator reads.
    const first = editor.getJSON().content?.[0];
    expect(first).toEqual({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Contention One" }],
    });

    editor.destroy();
    await handle.close();
  });
});

describe("getOutline", () => {
  it("returns headings in document order with level, text, and position", async () => {
    const { handle, editor } = await openHeadingEditor();

    editor.commands.setContent(
      "<h1>1AC</h1><p>intro</p><h2>Framework</h2><h3>Standard</h3><p>tail</p>",
    );

    const outline = getOutline(editor);
    expect(shape(outline)).toEqual([
      { level: 1, text: "1AC" },
      { level: 2, text: "Framework" },
      { level: 3, text: "Standard" },
    ]);

    // Positions are real, ascending document positions usable as scroll targets.
    const positions = outline.map((h) => h.pos);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(new Set(positions).size).toBe(positions.length);
    // Selecting inside a heading via pos + 1 lands on that heading node.
    editor.commands.setTextSelection(outline[1].pos + 1);
    expect(editor.state.selection.$from.parent.type.name).toBe("heading");

    editor.destroy();
    await handle.close();
  });

  it("flattens inline marks to plain text in the label", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
    await handle.whenLoaded;
    const editor = createEditor({
      binding: { handle, fragment: "body" },
      extensions: [heading, Bold],
    });

    editor.commands.setContent("<h2>Impact <strong>calculus</strong></h2>");

    expect(getOutline(editor)).toEqual([
      expect.objectContaining({ level: 2, text: "Impact calculus" }),
    ]);

    editor.destroy();
    await handle.close();
  });

  it("returns an empty outline for a document with no headings", async () => {
    const { handle, editor } = await openHeadingEditor();

    editor.commands.setContent("<p>just prose</p>");
    expect(getOutline(editor)).toEqual([]);

    editor.destroy();
    await handle.close();
  });
});

describe("observeOutline (live ToC seam)", () => {
  it("reflects added, edited, and removed headings", async () => {
    const { handle, editor } = await openHeadingEditor();

    const snapshots: OutlineHeading[][] = [];
    const stop = observeOutline(editor, (outline) => snapshots.push(outline));

    // Fires immediately with the initial (empty) outline.
    expect(shape(snapshots.at(-1)!)).toEqual([]);

    // Add headings.
    editor.commands.setContent("<h1>Aff</h1><h2>Case</h2>");
    expect(shape(snapshots.at(-1)!)).toEqual([
      { level: 1, text: "Aff" },
      { level: 2, text: "Case" },
    ]);

    // Edit a heading's text.
    editor.commands.setContent("<h1>Neg</h1><h2>Case</h2>");
    expect(shape(snapshots.at(-1)!)).toEqual([
      { level: 1, text: "Neg" },
      { level: 2, text: "Case" },
    ]);

    // Remove a heading.
    editor.commands.setContent("<h1>Neg</h1><p>body</p>");
    expect(shape(snapshots.at(-1)!)).toEqual([{ level: 1, text: "Neg" }]);

    stop();
    const countAfterStop = snapshots.length;
    editor.commands.setContent("<h1>ignored after unsubscribe</h1>");
    expect(snapshots.length).toBe(countAfterStop);

    editor.destroy();
    await handle.close();
  });

  it("does not re-fire on a selection-only change", async () => {
    const { handle, editor } = await openHeadingEditor();

    editor.commands.setContent("<h1>Title</h1><p>body text</p>");

    let calls = 0;
    const stop = observeOutline(editor, () => {
      calls += 1;
    });
    expect(calls).toBe(1); // immediate fire only

    // Move the cursor without changing the document.
    editor.commands.setTextSelection(2);
    expect(calls).toBe(1);

    stop();
    editor.destroy();
    await handle.close();
  });
});

describe("outline persistence through the document layer", () => {
  it("derives the same outline from a freshly reloaded document", async () => {
    const id = uniqueId();

    const first = openDocument({ id, kind: "speech-doc" });
    await first.whenLoaded;
    const firstEditor = createEditor({
      binding: { handle: first, fragment: "body" },
      extensions: [heading],
    });
    firstEditor.commands.setContent(
      "<h1>1AC</h1><h2>Framework</h2><h2>Contention</h2>",
    );
    const before = shape(getOutline(firstEditor));
    firstEditor.destroy();
    await first.close();

    // A genuinely separate handle + editor reads the headings back out.
    const second = openDocument({ id, kind: "speech-doc" });
    await second.whenLoaded;
    const secondEditor = createEditor({
      binding: { handle: second, fragment: "body" },
      extensions: [heading],
    });

    expect(shape(getOutline(secondEditor))).toEqual(before);
    expect(before).toEqual([
      { level: 1, text: "1AC" },
      { level: 2, text: "Framework" },
      { level: 2, text: "Contention" },
    ]);

    secondEditor.destroy();
    await second.close();
  });
});
