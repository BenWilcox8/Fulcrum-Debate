/**
 * Behavioral tests for the unformatted-text shrink rule.
 *
 * The rule: a text run that matches **none** of the named formatting styles
 * (tag/cite/body/highlight) is *unformatted* and adopts the profile's configured
 * shrink size (default 8pt). Classification is a pure function over editor state;
 * application drops the shrink size onto those runs via the shared font-size mark.
 *
 * Follows the established block-file test pattern - `fake-indexeddb/auto` + a
 * fresh `IDBFactory` per test, assertions on the editor API / document JSON, never
 * ProseMirror plugin internals or pixels.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { readFontSizes } from "../editor/marks";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "../blockfile/schema";
import { getSideRegion } from "../blockfile/sections";
import { cardExtensions } from "../blockfile/card";
import {
  DEFAULT_FORMATTING_PROFILE,
  type FormattingProfile,
} from "./profile";
import {
  classifyRuns,
  classifyRunAt,
  shrinkSize,
  applyShrinkRule,
  type ClassifiedRun,
} from "./shrink";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openHandle(id: string): Promise<DocumentHandle> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

function openEditor(handle: DocumentHandle): Editor {
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
 * A card body paragraph whose middle run is highlighted, so the body holds two
 * mark states: an un-highlighted head/tail (unformatted) and a highlighted middle.
 */
function cardWithHighlightedBody(): JSONContent {
  return {
    type: "card",
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
              { type: "text", text: "intro " },
              {
                type: "text",
                text: "read aloud",
                marks: [{ type: "highlight" }],
              },
              { type: "text", text: " outro" },
            ],
          },
        ],
      },
    ],
  };
}

/** Insert `content` after the aff side's leading paragraph and return the editor. */
function insertInAff(editor: Editor, content: JSONContent): Editor {
  const aff = getSideRegion(editor, "aff");
  editor
    .chain()
    .insertContentAt(aff.contentEnd, content, { updateSelection: false })
    .run();
  return editor;
}

/** The `{ from, to }` range of the text run whose text is exactly `text`. */
function textRange(editor: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`textRange: no run "${text}"`);
  return range;
}

/** The classification recorded for the run whose text is exactly `text`. */
function classOf(runs: ClassifiedRun[], editor: Editor, text: string): string {
  const { from } = textRange(editor, text);
  const run = runs.find((r) => r.from <= from && from < r.to);
  if (!run) throw new Error(`classOf: no run covering "${text}"`);
  return run.classification;
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

describe("classifyRuns", () => {
  it("classifies each card region's text by its named style", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("regions")),
      cardWithHighlightedBody(),
    );

    const runs = classifyRuns(editor.state);

    // tag/cite line up with the named styles; the tagline inherits body styling.
    expect(classOf(runs, editor, "T")).toBe("tag");
    expect(classOf(runs, editor, "Warming is real")).toBe("body");
    expect(classOf(runs, editor, "Smith 24")).toBe("cite");
  });

  it("classifies a highlighted body run as highlight, un-highlighted as unformatted", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("body-marks")),
      cardWithHighlightedBody(),
    );

    const runs = classifyRuns(editor.state);

    expect(classOf(runs, editor, "read aloud")).toBe("highlight");
    expect(classOf(runs, editor, "intro ")).toBe("unformatted");
    expect(classOf(runs, editor, " outro")).toBe("unformatted");
  });

  it("classifies loose prose outside any card as unformatted", async () => {
    const editor = insertInAff(openEditor(await openHandle("loose")), {
      type: "paragraph",
      content: [{ type: "text", text: "loose analysis" }],
    });

    const runs = classifyRuns(editor.state);

    expect(classOf(runs, editor, "loose analysis")).toBe("unformatted");
  });

  it("returns runs in document order with exact positions", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("order")),
      cardWithHighlightedBody(),
    );

    const runs = classifyRuns(editor.state);

    // Ordered and non-overlapping.
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].from).toBeGreaterThanOrEqual(runs[i - 1].to);
    }
    // The middle highlighted run sits exactly on its text node.
    const highlighted = runs.find((r) => r.classification === "highlight");
    expect(highlighted).toEqual({
      ...textRange(editor, "read aloud"),
      classification: "highlight",
    });
  });

  it("is a pure read: classifying does not mutate the document", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("pure")),
      cardWithHighlightedBody(),
    );
    const before = editor.getJSON();

    classifyRuns(editor.state);

    expect(editor.getJSON()).toEqual(before);
  });
});

describe("classifyRunAt", () => {
  it("classifies the run at a position", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("at")),
      cardWithHighlightedBody(),
    );

    const tag = textRange(editor, "T");
    const highlighted = textRange(editor, "read aloud");
    const unformatted = textRange(editor, "intro ");

    expect(classifyRunAt(editor.state, tag.from)).toBe("tag");
    expect(classifyRunAt(editor.state, highlighted.from)).toBe("highlight");
    expect(classifyRunAt(editor.state, unformatted.from)).toBe("unformatted");
  });

  it("returns null where no text run sits", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("at-null")),
      cardWithHighlightedBody(),
    );

    // Position 0 is the very start of the doc (before the aff section) - no text.
    expect(classifyRunAt(editor.state, 0)).toBeNull();
  });
});

describe("shrinkSize", () => {
  it("defaults to the standard unformatted size (8pt)", () => {
    expect(shrinkSize()).toBe("8pt");
    expect(shrinkSize(DEFAULT_FORMATTING_PROFILE)).toBe("8pt");
  });

  it("reads the configured unformatted size from a profile", () => {
    const profile: FormattingProfile = {
      ...DEFAULT_FORMATTING_PROFILE,
      unformatted: { ...DEFAULT_FORMATTING_PROFILE.unformatted, fontSize: "6pt" },
    };
    expect(shrinkSize(profile)).toBe("6pt");
  });
});

describe("applyShrinkRule", () => {
  it("shrinks unformatted runs and leaves named styles untouched", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("apply")),
      cardWithHighlightedBody(),
    );

    const changed = applyShrinkRule(editor);
    expect(changed).toBe(true);

    const sizeOf = (text: string): (string | null)[] => {
      const { from, to } = textRange(editor, text);
      editor.chain().setTextSelection({ from, to }).run();
      return readFontSizes(editor);
    };

    // Un-highlighted body runs are shrunk to 8pt.
    expect(sizeOf("intro ")).toEqual(["8pt"]);
    expect(sizeOf(" outro")).toEqual(["8pt"]);
    // The highlighted run and the header regions keep their (unset) size.
    expect(sizeOf("read aloud")).toEqual([null]);
    expect(sizeOf("Warming is real")).toEqual([null]);
  });

  it("uses the configured (off-scale) shrink size from the profile", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("apply-config")),
      cardWithHighlightedBody(),
    );
    const profile: FormattingProfile = {
      ...DEFAULT_FORMATTING_PROFILE,
      unformatted: { ...DEFAULT_FORMATTING_PROFILE.unformatted, fontSize: "6pt" },
    };

    applyShrinkRule(editor, profile);

    const { from, to } = textRange(editor, "intro ");
    editor.chain().setTextSelection({ from, to }).run();
    expect(readFontSizes(editor)).toEqual(["6pt"]);
  });

  it("is idempotent: a second application is a no-op", async () => {
    const editor = insertInAff(
      openEditor(await openHandle("idempotent")),
      cardWithHighlightedBody(),
    );

    expect(applyShrinkRule(editor)).toBe(true);
    expect(applyShrinkRule(editor)).toBe(false);
  });

  it("returns false when there are no unformatted runs", async () => {
    // A card whose whole body is highlighted; only named styles are present.
    const editor = insertInAff(openEditor(await openHandle("none")), {
      type: "card",
      content: [
        { type: "cardTag", content: [{ type: "text", text: "T" }] },
        { type: "cardTagline", content: [{ type: "text", text: "claim" }] },
        { type: "cardCite", content: [{ type: "text", text: "Smith 24" }] },
        {
          type: "cardBody",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "all read aloud",
                  marks: [{ type: "highlight" }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(applyShrinkRule(editor)).toBe(false);
  });
});
