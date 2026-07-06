/**
 * Behavioral tests for the Highlight card-cutting tool - the first real tool on
 * the toolbar framework. It toggles the shared `highlight` mark (the "read this
 * aloud" flag) on the active selection, so a debater can mark the words they
 * read out of a longer card. The highlighter *color* is a live preference (a
 * global render choice, not a per-run mark attribute), so these tests cover the
 * mark behaviour (apply/remove, independence from bold) and the pure color->CSS
 * mapping; the live rendering is covered in `../react/HighlightStyles.test.tsx`.
 *
 * The mark is asserted only through the editor's public command output (document
 * JSON) - never ProseMirror internals - matching the marks-layer test discipline.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import { BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME } from "../../editor/marks";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  buildCardContent,
  getSideRegion,
} from "../../blockfile";
import {
  highlightCardTool,
  highlightColorCss,
  HIGHLIGHT_COLORS,
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_TOOL_SCOPE,
} from "./highlightCardTool";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

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

/**
 * Insert a card (with a non-empty body run) into the aff side and return a
 * `{ from, to }` range that spans the body's text, so the tool can highlight a
 * real run. Positions come from an independent walk of the document, never the
 * code under test.
 */
function insertCardAndSelectBody(editor: Editor): void {
  const aff = getSideRegion(editor, "aff");
  const at = aff.contentEnd;
  editor
    .chain()
    .insertContentAt(
      at,
      buildCardContent({ tag: "T", body: "read this aloud" }),
      { updateSelection: false },
    )
    .run();

  // Walk to the cardBody text run and select its whole extent.
  let from = -1;
  let to = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "cardBody") {
      node.descendants((child, childPos) => {
        if (child.isText) {
          from = pos + 1 + childPos;
          to = from + child.nodeSize;
        }
        return true;
      });
    }
    return true;
  });
  editor.commands.setTextSelection({ from, to });
}

/** Mark names on the first text leaf inside the document's cardBody. */
function bodyRunMarkNames(json: JSONContent): string[] {
  let names: string[] = [];
  const visit = (node?: JSONContent) => {
    if (!node) return;
    if (node.type === "cardBody") {
      const leaf = node.content?.[0]?.content?.[0];
      names = (leaf?.marks ?? []).map((m) => m.type).sort();
      return;
    }
    node.content?.forEach(visit);
  };
  visit(json);
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

describe("highlightCardTool", () => {
  it("declares an id, label, and a color settings field with the palette default", () => {
    expect(highlightCardTool.id).toBe("highlight");
    expect(highlightCardTool.label).toBeTruthy();
    expect(highlightCardTool.settings.color.default).toBe(
      DEFAULT_HIGHLIGHT_COLOR,
    );
    // The color is offered as an enumerated palette, so the schema-generated
    // Settings panel renders a select of highlighter colors.
    expect(highlightCardTool.settings.color.options).toEqual(HIGHLIGHT_COLORS);
    expect(HIGHLIGHT_COLORS).toContain(DEFAULT_HIGHLIGHT_COLOR);
  });

  it("applies the highlight mark to the active selection", async () => {
    const editor = await openEditor("apply");
    insertCardAndSelectBody(editor);

    const changed = highlightCardTool.applyToSelection(editor, {
      color: DEFAULT_HIGHLIGHT_COLOR,
    });

    expect(changed).toBe(true);
    expect(bodyRunMarkNames(editor.getJSON())).toEqual([HIGHLIGHT_MARK_NAME]);
  });

  it("removes the highlight mark on a second application (toggle)", async () => {
    const editor = await openEditor("toggle");
    insertCardAndSelectBody(editor);

    highlightCardTool.applyToSelection(editor, { color: DEFAULT_HIGHLIGHT_COLOR });
    expect(bodyRunMarkNames(editor.getJSON())).toEqual([HIGHLIGHT_MARK_NAME]);

    highlightCardTool.applyToSelection(editor, { color: DEFAULT_HIGHLIGHT_COLOR });
    expect(bodyRunMarkNames(editor.getJSON())).toEqual([]);
  });

  it("is fully independent of bold - either mark toggles without touching the other", async () => {
    const editor = await openEditor("independent");
    insertCardAndSelectBody(editor);

    // Bold first, then highlight: both coexist on the same run.
    editor.commands.setBold();
    highlightCardTool.applyToSelection(editor, { color: DEFAULT_HIGHLIGHT_COLOR });
    expect(bodyRunMarkNames(editor.getJSON())).toEqual(
      [BOLD_MARK_NAME, HIGHLIGHT_MARK_NAME].sort(),
    );

    // Remove highlight: bold survives untouched.
    highlightCardTool.applyToSelection(editor, { color: DEFAULT_HIGHLIGHT_COLOR });
    expect(bodyRunMarkNames(editor.getJSON())).toEqual([BOLD_MARK_NAME]);
  });
});

describe("highlightColorCss", () => {
  it("emits a scoped background-color rule for the highlight mark", () => {
    const css = highlightColorCss("cyan");
    expect(css).toContain(`${HIGHLIGHT_TOOL_SCOPE} mark`);
    expect(css).toContain("background-color: cyan");
  });

  it("honours a custom scope", () => {
    const css = highlightColorCss("yellow", ".other-surface");
    expect(css).toContain(".other-surface mark");
    expect(css).not.toContain(HIGHLIGHT_TOOL_SCOPE + " mark");
  });
});
