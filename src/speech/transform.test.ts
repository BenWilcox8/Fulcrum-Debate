/**
 * Behavioral tests for the Auto Speech transform engine.
 *
 * The transform is the highest test seam of the Auto Speech feature - a pure
 * function turning card / selection content into speech-ready document-JSON - so it
 * is exercised thoroughly here, including every configuration variation. The tests
 * build real block-file + card documents through the shipping schema (so the input
 * is always schema-valid the way the editor produces it) and assert on the returned
 * block-level JSON, never on ProseMirror internals.
 *
 * Nodes are constructed via `schema.nodeFromJSON` rather than editor commands: the
 * engine is pure over a ProseMirror node, so a directly-parsed doc is the cleanest,
 * most controllable input, and lets a test place headers and cards exactly.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { HIGHLIGHT_MARK_NAME, BOLD_MARK_NAME } from "../editor/marks";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions, cardExtensions } from "../blockfile";
import {
  transformToSpeech,
  DEFAULT_SPEECH_SEPARATOR,
} from "./transform";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];
let schema: Schema;

beforeEach(async () => {
  const handle = openDocument({ id: "speech-schema", kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
    }),
  });
  editors.push(editor);
  schema = editor.schema;
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  editors = [];
  handles = [];
});

/** A run of body text, optionally highlighted and/or bold. */
interface Run {
  text: string;
  highlight?: boolean;
  bold?: boolean;
}

function runMarks(run: Run): JSONContent["marks"] {
  const marks: NonNullable<JSONContent["marks"]> = [];
  if (run.highlight) marks.push({ type: HIGHLIGHT_MARK_NAME });
  if (run.bold) marks.push({ type: BOLD_MARK_NAME });
  return marks.length > 0 ? marks : undefined;
}

interface CardFields {
  tag?: string;
  tagline?: string;
  cite?: string;
  /** Body paragraphs, each a list of runs. */
  body?: Run[][];
}

function cardJson(fields: CardFields): JSONContent {
  const textRegion = (type: string, text?: string): JSONContent =>
    text ? { type, content: [{ type: "text", text }] } : { type };
  const body = (fields.body ?? [[]]).map((runs) => ({
    type: "paragraph",
    content: runs.map((r) => ({
      type: "text",
      text: r.text,
      ...(runMarks(r) ? { marks: runMarks(r) } : {}),
    })),
  }));
  return {
    type: "card",
    content: [
      textRegion("cardTag", fields.tag),
      textRegion("cardTagline", fields.tagline),
      textRegion("cardCite", fields.cite),
      { type: "cardBody", content: body },
    ],
  };
}

function heading(level: number, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

/** Build a schema-valid block-file doc whose aff side holds `blocks`. */
function doc(blocks: JSONContent[]): ProseMirrorNode {
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      { type: "affSection", content: blocks },
      { type: "negSection", content: [{ type: "paragraph" }] },
    ],
  });
}

/** Flatten a paragraph/heading block's inline text. */
function blockText(block: JSONContent): string {
  return (block.content ?? []).map((c) => c.text ?? "").join("");
}

describe("transformToSpeech - single card", () => {
  it("emits bold tagline, cite, and only the highlighted body as plain text", () => {
    const out = transformToSpeech(
      doc([
        cardJson({
          tag: "T",
          tagline: "Warming is real",
          cite: "Smith 24",
          body: [
            [
              { text: "Skip this. " },
              { text: "Read this aloud.", highlight: true },
              { text: " Skip this too." },
            ],
          ],
        }),
      ]),
    );

    // tagline (bold) + cite + one highlighted body paragraph
    expect(out).toHaveLength(3);

    const [tagline, cite, body] = out;
    expect(blockText(tagline)).toBe("Warming is real");
    expect(tagline.content?.[0].marks).toEqual([{ type: BOLD_MARK_NAME }]);

    expect(blockText(cite)).toBe("Smith 24");
    expect(cite.content?.[0].marks).toBeUndefined();

    // former highlight becomes plain readable text; surrounding prose stripped
    expect(blockText(body)).toBe("Read this aloud.");
    expect(body.content?.[0].marks).toBeUndefined();
  });

  it("strips a body paragraph that has no highlighted text entirely", () => {
    const out = transformToSpeech(
      doc([
        cardJson({
          tagline: "Claim",
          body: [[{ text: "Nothing here is highlighted." }]],
        }),
      ]),
    );

    // only the tagline survives - the un-highlighted body contributes nothing
    expect(out).toHaveLength(1);
    expect(blockText(out[0])).toBe("Claim");
  });

  it("flattens highlighted-and-bold runs to plain text (all marks dropped)", () => {
    const out = transformToSpeech(
      doc([
        cardJson({
          body: [[{ text: "bold spoken", highlight: true, bold: true }]],
        }),
      ]),
    );

    expect(out).toHaveLength(1);
    expect(blockText(out[0])).toBe("bold spoken");
    expect(out[0].content?.[0].marks).toBeUndefined();
  });

  it("keeps one output paragraph per source body paragraph that has highlights", () => {
    const out = transformToSpeech(
      doc([
        cardJson({
          body: [
            [{ text: "first spoken", highlight: true }],
            [{ text: "unspoken only" }],
            [{ text: "third spoken", highlight: true }],
          ],
        }),
      ]),
    );

    // paragraph two (no highlight) is dropped; the other two survive in order
    expect(out.map(blockText)).toEqual(["first spoken", "third spoken"]);
  });

  it("transforms a bare card node passed directly", () => {
    const cardNode = schema.nodeFromJSON(
      cardJson({
        tagline: "Direct",
        body: [[{ text: "spoken", highlight: true }]],
      }),
    );

    const out = transformToSpeech(cardNode);
    expect(out.map(blockText)).toEqual(["Direct", "spoken"]);
  });
});

describe("transformToSpeech - multiple cards and headers", () => {
  it("inserts a separator between two adjacent cards", () => {
    const out = transformToSpeech(
      doc([
        cardJson({ tagline: "One", body: [[{ text: "a", highlight: true }]] }),
        cardJson({ tagline: "Two", body: [[{ text: "b", highlight: true }]] }),
      ]),
    );

    expect(out.map(blockText)).toEqual([
      "One",
      "a",
      DEFAULT_SPEECH_SEPARATOR,
      "Two",
      "b",
    ]);
  });

  it("preserves section headers with their level", () => {
    const out = transformToSpeech(
      doc([
        heading(1, "AT: Gold"),
        cardJson({ tagline: "One", body: [[{ text: "a", highlight: true }]] }),
      ]),
    );

    expect(out[0].type).toBe("heading");
    expect(out[0].attrs).toEqual({ level: 1 });
    expect(blockText(out[0])).toBe("AT: Gold");
    expect(out.map(blockText)).toEqual(["AT: Gold", "One", "a"]);
  });

  it("treats a header between two cards as the divider (no extra separator)", () => {
    const out = transformToSpeech(
      doc([
        cardJson({ tagline: "One", body: [[{ text: "a", highlight: true }]] }),
        heading(1, "AT: Fusion"),
        cardJson({ tagline: "Two", body: [[{ text: "b", highlight: true }]] }),
      ]),
    );

    expect(out.map(blockText)).toEqual([
      "One",
      "a",
      "AT: Fusion",
      "Two",
      "b",
    ]);
    // no separator paragraph appears anywhere
    expect(out.map(blockText)).not.toContain(DEFAULT_SPEECH_SEPARATOR);
  });
});

describe("transformToSpeech - configuration", () => {
  const sample = () =>
    doc([
      cardJson({
        tag: "CP",
        tagline: "Claim",
        cite: "Smith 24",
        body: [[{ text: "spoken", highlight: true }]],
      }),
      cardJson({
        tag: "DA",
        tagline: "Claim2",
        cite: "Jones 23",
        body: [[{ text: "spoken2", highlight: true }]],
      }),
    ]);

  it("includeTag: true prepends the tag line", () => {
    const out = transformToSpeech(sample(), { includeTag: true });
    expect(out.map(blockText)).toEqual([
      "CP",
      "Claim",
      "Smith 24",
      "spoken",
      DEFAULT_SPEECH_SEPARATOR,
      "DA",
      "Claim2",
      "Jones 23",
      "spoken2",
    ]);
  });

  it("includeCite: false omits the cite", () => {
    const out = transformToSpeech(sample(), { includeCite: false });
    expect(out.map(blockText)).not.toContain("Smith 24");
    expect(out.map(blockText)).not.toContain("Jones 23");
  });

  it("includeTagline: false omits the tagline", () => {
    const out = transformToSpeech(sample(), { includeTagline: false });
    expect(out.map(blockText)).not.toContain("Claim");
    expect(out.map(blockText)).not.toContain("Claim2");
  });

  it("boldTagline: false emits the tagline as plain text", () => {
    const out = transformToSpeech(sample(), { boldTagline: false });
    const tagline = out.find((b) => blockText(b) === "Claim");
    expect(tagline?.content?.[0].marks).toBeUndefined();
  });

  it("custom separator string is used between cards", () => {
    const out = transformToSpeech(sample(), { separator: "* * *" });
    expect(out.map(blockText)).toContain("* * *");
    expect(out.map(blockText)).not.toContain(DEFAULT_SPEECH_SEPARATOR);
  });

  it("empty separator disables the divider between cards", () => {
    const out = transformToSpeech(sample(), { separator: "" });
    // two cards flow together with no separator paragraph
    expect(out.map(blockText)).toEqual([
      "Claim",
      "Smith 24",
      "spoken",
      "Claim2",
      "Jones 23",
      "spoken2",
    ]);
  });

  it("includeSectionHeaders: false drops headers", () => {
    const out = transformToSpeech(
      doc([
        heading(1, "AT: Gold"),
        cardJson({ tagline: "One", body: [[{ text: "a", highlight: true }]] }),
      ]),
      { includeSectionHeaders: false },
    );
    expect(out.map(blockText)).toEqual(["One", "a"]);
  });
});

describe("transformToSpeech - purity", () => {
  it("does not mutate the input node", () => {
    const input = doc([
      cardJson({
        tagline: "Claim",
        body: [[{ text: "spoken", highlight: true }]],
      }),
    ]);
    const before = input.toJSON();

    transformToSpeech(input);

    expect(input.toJSON()).toEqual(before);
  });

  it("ignores loose prose outside a card", () => {
    const out = transformToSpeech(
      doc([
        { type: "paragraph", content: [{ type: "text", text: "loose prose" }] },
        cardJson({ tagline: "Claim", body: [[{ text: "s", highlight: true }]] }),
      ]),
    );
    expect(out.map(blockText)).toEqual(["Claim", "s"]);
  });
});
