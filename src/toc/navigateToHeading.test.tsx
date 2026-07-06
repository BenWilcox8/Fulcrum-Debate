// The click-to-scroll seam, driven over a *real* block-file editor + handle (no
// mocks), the established pattern (fake-indexeddb + fresh IDBFactory per test).
// It proves navigating to an outline heading's `pos` moves the selection inside
// that heading (both enforced sides), and that a stale `pos` - one that no
// longer addresses a heading after the document changed - is a safe no-op
// rather than a throw or a wrong-node selection. Assertions are behavioral
// (resulting editor selection), never ProseMirror internals or pixels.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "../blockfile";
import { getOutline } from "../editor/headings";
import { navigateToHeading } from "./navigateToHeading";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `toc-nav-${Date.now()}-${nextId++}`;

/** One section node with an ordered list of `[level, text]` headings. */
function section(
  type: "affSection" | "negSection",
  headings: [number, string][],
): JSONContent {
  return {
    type,
    content: headings.map(([level, text]) => ({
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text }],
    })),
  };
}

/** A block-file doc with the given aff / neg headings. */
function blockDoc(
  aff: [number, string][],
  neg: [number, string][],
): JSONContent {
  return {
    type: "doc",
    content: [section("affSection", aff), section("negSection", neg)],
  };
}

/** Opens a real block-file handle + editor bound to its body fragment. */
async function openBlockEditor(): Promise<{
  handle: DocumentHandle;
  editor: Editor;
}> {
  const handle = openDocument({ id: uniqueId(), kind: "block-file" });
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  return { handle, editor };
}

/** The heading node the current selection sits inside, or null. */
function selectedHeadingText(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === "heading") return node.textContent;
  }
  return null;
}

describe("navigateToHeading", () => {
  it("moves the selection into an aff-side heading", async () => {
    const { editor } = await openBlockEditor();
    editor.commands.setContent(
      blockDoc(
        [
          [1, "AT: Gold"],
          [1, "AT: Fusion"],
        ],
        [],
      ),
    );

    const outline = getOutline(editor);
    const target = outline.find((h) => h.text === "AT: Fusion")!;

    const moved = navigateToHeading(editor, target.pos);

    expect(moved).toBe(true);
    expect(selectedHeadingText(editor)).toBe("AT: Fusion");

    editor.destroy();
  });

  it("moves the selection into a neg-side heading", async () => {
    const { editor } = await openBlockEditor();
    editor.commands.setContent(
      blockDoc([[1, "AT: Gold"]], [[1, "AT: Deterrence"]]),
    );

    const outline = getOutline(editor);
    const target = outline.find((h) => h.text === "AT: Deterrence")!;

    const moved = navigateToHeading(editor, target.pos);

    expect(moved).toBe(true);
    expect(selectedHeadingText(editor)).toBe("AT: Deterrence");

    editor.destroy();
  });

  it("is a no-op for a stale pos that no longer addresses a heading", async () => {
    const { editor } = await openBlockEditor();
    editor.commands.setContent(
      blockDoc(
        [
          [1, "First"],
          [1, "Second"],
        ],
        [],
      ),
    );

    // Snapshot a pos, then mutate the document so the snapshot is stale.
    const stalePos = getOutline(editor).find((h) => h.text === "Second")!.pos;
    editor.commands.setContent(blockDoc([], []));

    // Position a known selection so we can prove it does not move.
    const before = editor.state.selection.from;
    const moved = navigateToHeading(editor, stalePos);

    expect(moved).toBe(false);
    expect(editor.state.selection.from).toBe(before);

    editor.destroy();
  });

  it("is a no-op for an out-of-range pos", async () => {
    const { editor } = await openBlockEditor();
    editor.commands.setContent(blockDoc([[1, "Only"]], []));

    const huge = editor.state.doc.content.size + 1000;
    expect(navigateToHeading(editor, huge)).toBe(false);
    expect(navigateToHeading(editor, -1)).toBe(false);

    editor.destroy();
  });
});
