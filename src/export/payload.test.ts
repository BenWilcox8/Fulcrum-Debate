/**
 * Behavioral tests for **per-surface payload assembly** - the PRD's highest seam
 * on the assembly side: a speech doc and a block file each serialize to an
 * {@link ExportPayload} whose formatting is preserved (semantic HTML) and whose
 * plain-text form keeps the document's structure.
 *
 * These drive real document handles over the `fake-indexeddb` harness the other
 * suites use, author content through a real shared editor (persisting to Yjs),
 * then assert on what `buildSpeechDocExportPayload` / `buildBlockFileExportPayload`
 * read back through their own headless editors - never on ProseMirror internals.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { HEADING_LEVELS } from "../editor/headings";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  getSideRegion,
  CARD_NODE_NAME,
  CARD_TAG_NODE_NAME,
  CARD_TAGLINE_NODE_NAME,
  CARD_CITE_NODE_NAME,
  CARD_BODY_NODE_NAME,
} from "../blockfile";
import { SPEECH_DOC_BODY_FRAGMENT } from "../speech-doc/speech-doc";
import {
  buildSpeechDocExportPayload,
  buildBlockFileExportPayload,
} from "./payload";

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

async function openSpeechDoc(id = `speech-${Date.now()}-${handles.length}`) {
  const handle = openDocument({ id, kind: "speech-doc" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

function speechEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: SPEECH_DOC_BODY_FRAGMENT },
    extensions: editorPreset(),
  });
  editors.push(editor);
  return editor;
}

async function openBlockFile(id = `block-${Date.now()}-${handles.length}`) {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

function blockFileEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
      headingLevels: HEADING_LEVELS,
    }),
  });
  editors.push(editor);
  return editor;
}

describe("speech doc export payload", () => {
  it("preserves rich formatting as semantic HTML and keeps text structure", async () => {
    const handle = await openSpeechDoc();
    const editor = speechEditor(handle);
    editor.commands.setContent(
      "<h1>1AC</h1><p><strong>Contention one:</strong> warming is real.</p>",
    );

    const payload = buildSpeechDocExportPayload(handle, "My 1AC");

    expect(payload.subject).toBe("My 1AC");
    // Formatting preserved: heading + bold survive as semantic tags.
    expect(payload.html).toContain("<h1>1AC</h1>");
    expect(payload.html).toContain("<strong>Contention one:</strong>");
    // A complete, email-friendly HTML document.
    expect(payload.html).toMatch(/^<!doctype html>/i);
    expect(payload.html).toContain('<meta charset="utf-8">');
    // Plain text keeps the content and separates the two blocks.
    expect(payload.text).toContain("1AC");
    expect(payload.text).toContain("Contention one: warming is real.");
    expect(payload.text).toContain("\n\n");
  });

  it("falls back to a sensible subject when no title is given", async () => {
    const handle = await openSpeechDoc();
    speechEditor(handle).commands.setContent("<p>body</p>");

    expect(buildSpeechDocExportPayload(handle).subject).toBe("Speech");
    expect(buildSpeechDocExportPayload(handle, "   ").subject).toBe("Speech");
  });

  it("escapes an HTML-significant subject in the document title", async () => {
    const handle = await openSpeechDoc();
    speechEditor(handle).commands.setContent("<p>body</p>");

    const payload = buildSpeechDocExportPayload(handle, "A & B <tag>");

    expect(payload.subject).toBe("A & B <tag>");
    expect(payload.html).toContain("<title>A &amp; B &lt;tag&gt;</title>");
  });
});

describe("block file export payload", () => {
  it("preserves the card anatomy and its body marks as semantic HTML", async () => {
    const handle = await openBlockFile();
    const editor = blockFileEditor(handle);
    const aff = getSideRegion(editor, "aff");
    editor
      .chain()
      .insertContentAt(
        aff.contentEnd,
        {
          type: CARD_NODE_NAME,
          content: [
            { type: CARD_TAG_NODE_NAME, content: [{ type: "text", text: "NU" }] },
            {
              type: CARD_TAGLINE_NODE_NAME,
              content: [{ type: "text", text: "Emissions are falling" }],
            },
            {
              type: CARD_CITE_NODE_NAME,
              content: [{ type: "text", text: "Smith 24" }],
            },
            {
              type: CARD_BODY_NODE_NAME,
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Plain lead-in. " },
                    {
                      type: "text",
                      marks: [{ type: "highlight" }],
                      text: "The key spoken line",
                    },
                  ],
                },
              ],
            },
          ],
        },
        { updateSelection: false },
      )
      .run();

    const payload = buildBlockFileExportPayload(handle, "Block File");

    expect(payload.subject).toBe("Block File");
    // Card regions survive as data-attribute-tagged HTML, and the highlight
    // mark renders as <mark>.
    expect(payload.html).toContain('data-card-region="tagline"');
    expect(payload.html).toContain("<mark>The key spoken line</mark>");
    // Plain text carries every region's content.
    expect(payload.text).toContain("Emissions are falling");
    expect(payload.text).toContain("Smith 24");
    expect(payload.text).toContain("The key spoken line");
  });

  it("falls back to the Block File subject when no title is given", async () => {
    const handle = await openBlockFile();
    blockFileEditor(handle);

    expect(buildBlockFileExportPayload(handle).subject).toBe("Block File");
  });
});
