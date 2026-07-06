/**
 * Behavioral tests for the Auto Speech clipboard card-cutting tool's model half.
 *
 * Auto Speech runs the shared {@link ../../speech.transformToSpeech | speech
 * engine} over the current selection and puts the speech-ready result on the
 * clipboard as both rich text (HTML) and plain text, so it pastes well into
 * external editors. These tests drive a real block-file + card editor (the same
 * `fake-indexeddb` harness the other tool suites use), stub the async clipboard
 * API, and assert on the payload the tool produces + the clipboard calls it makes
 * - never on ProseMirror internals. The engine itself is tested separately; here
 * we prove the toolbar/clipboard/settings *wiring*.
 *
 * Positions that drive the assertions come from an independent document walk,
 * never the code under test - the same discipline as `card-unit.test.ts`.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

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
import {
  openPreferenceStore,
  type PersistentPreferenceStore,
} from "../../preferences";
import { createCardToolRegistry, toolSectionId } from "../registry";
import {
  AUTO_SPEECH_TOOL_ID,
  AUTO_SPEECH_TOOL_LABEL,
  autoSpeechTool,
  buildSpeechPayload,
  copySpeechToClipboard,
} from "./auto-speech";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];
let stores: PersistentPreferenceStore[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  for (const store of stores) store.close();
  editors = [];
  handles = [];
  stores = [];
  vi.unstubAllGlobals();
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

/** Put the caret inside the first card body (independent walk). */
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

/**
 * Stub `navigator.clipboard` (preserving the fields Tiptap's iOS detection reads,
 * `platform`/`userAgent`, so editor creation still works) plus a minimal
 * `ClipboardItem`, recording the write / writeText calls.
 */
function stubNavigator(clipboard: Record<string, unknown>): void {
  const real = globalThis.navigator;
  vi.stubGlobal("navigator", {
    platform: real?.platform ?? "",
    userAgent: real?.userAgent ?? "",
    clipboard,
  });
}

function stubClipboard(): {
  write: ReturnType<typeof vi.fn>;
  writeText: ReturnType<typeof vi.fn>;
} {
  const write = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  stubNavigator({ write, writeText });
  // A minimal ClipboardItem that keeps the item map for assertions.
  class ClipboardItemStub {
    items: Record<string, Blob>;
    constructor(items: Record<string, Blob>) {
      this.items = items;
    }
  }
  vi.stubGlobal("ClipboardItem", ClipboardItemStub);
  return { write, writeText };
}

/** Read a Blob's text (jsdom's Blob has no `.text()`, so use FileReader). */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe("autoSpeechTool definition", () => {
  it("has the stable id/label and exposes the engine config as settings", () => {
    expect(autoSpeechTool.id).toBe(AUTO_SPEECH_TOOL_ID);
    expect(autoSpeechTool.label).toBe(AUTO_SPEECH_TOOL_LABEL);

    const s = autoSpeechTool.settings;
    // Defaults mirror the engine's standard speech.
    expect(s.separator.default).toBe("---");
    expect(s.includeSectionHeaders.default).toBe(true);
    expect(s.includeTag.default).toBe(false);
    expect(s.includeTagline.default).toBe(true);
    expect(s.boldTagline.default).toBe(true);
    expect(s.includeCite.default).toBe(true);
    // Each field is self-describing so the schema panel can render it.
    expect(s.separator.label).toBeTruthy();
    expect(s.includeCite.label).toBeTruthy();
  });
});

describe("buildSpeechPayload", () => {
  it("builds html + plain text from the card at the selection", async () => {
    const editor = await openEditor("build");
    insertCard(
      editor,
      [[{ text: "Skip. " }, { text: "Read aloud.", marks: hl() }, { text: " Skip." }]],
      { tagline: "The claim", cite: "Author 2020" },
    );
    caretInFirstBody(editor);

    const payload = buildSpeechPayload(editor, {});
    expect(payload).not.toBeNull();
    // Plain text carries the readable speech content.
    expect(payload!.text).toContain("The claim");
    expect(payload!.text).toContain("Author 2020");
    expect(payload!.text).toContain("Read aloud.");
    // Un-highlighted body text is stripped by the engine.
    expect(payload!.text).not.toContain("Skip.");
    // HTML renders the tagline bold (a real <strong>), so it pastes emphasized.
    expect(payload!.html).toMatch(/<strong>The claim<\/strong>/);
    expect(payload!.html).toContain("Read aloud.");
  });

  it("observes the engine config passed to it", async () => {
    const editor = await openEditor("config");
    insertCard(editor, [[{ text: "Read.", marks: hl() }]], {
      tag: "CP",
      tagline: "Claim",
      cite: "Cite 1999",
    });
    caretInFirstBody(editor);

    // Cite suppressed, tag included: the payload follows the options.
    const payload = buildSpeechPayload(editor, {
      includeCite: false,
      includeTag: true,
    });
    expect(payload!.text).toContain("CP");
    expect(payload!.text).toContain("Claim");
    expect(payload!.text).not.toContain("Cite 1999");
  });

  it("returns null when the selection is not in a card", async () => {
    const editor = await openEditor("nocard");
    // Fresh block file: caret in the aff section's leading paragraph, no card.
    editor.commands.setTextSelection(1);
    expect(buildSpeechPayload(editor, {})).toBeNull();
  });
});

describe("copySpeechToClipboard", () => {
  it("writes rich text and plain text to the clipboard", async () => {
    const { write } = stubClipboard();
    const editor = await openEditor("copy");
    insertCard(editor, [[{ text: "Read aloud.", marks: hl() }]], {
      tagline: "Claim",
    });
    caretInFirstBody(editor);

    const result = await copySpeechToClipboard(editor, {});
    expect(result).not.toBeNull();
    expect(write).toHaveBeenCalledTimes(1);

    const [items] = write.mock.calls[0];
    const item = items[0] as { items: Record<string, Blob> };
    expect(Object.keys(item.items).sort()).toEqual(["text/html", "text/plain"]);
  });

  it("falls back to writeText when ClipboardItem is unavailable", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ write, writeText });
    vi.stubGlobal("ClipboardItem", undefined);

    const editor = await openEditor("fallback");
    insertCard(editor, [[{ text: "Read aloud.", marks: hl() }]], {
      tagline: "Claim",
    });
    caretInFirstBody(editor);

    await copySpeechToClipboard(editor, {});
    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain("Claim");
  });

  it("returns null (no clipboard write) when there is nothing to copy", async () => {
    const { write, writeText } = stubClipboard();
    const editor = await openEditor("empty");
    editor.commands.setTextSelection(1);

    expect(await copySpeechToClipboard(editor, {})).toBeNull();
    expect(write).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe("autoSpeechTool through the registry", () => {
  it("copies using the tool's live, persisted settings", async () => {
    const { write } = stubClipboard();
    const store = openPreferenceStore();
    stores.push(store);
    await store.whenLoaded;

    const registry = createCardToolRegistry(store);
    const speech = registry.register(autoSpeechTool);
    expect(store.getSection(toolSectionId(AUTO_SPEECH_TOOL_ID))).toBeDefined();

    const editor = await openEditor("registry");
    insertCard(editor, [[{ text: "Read aloud.", marks: hl() }]], {
      tag: "DA",
      tagline: "Claim",
    });
    caretInFirstBody(editor);

    // Reconfigure through the tool's settings section: include the tag.
    speech.settings.set("includeTag", true);

    expect(speech.apply(editor)).toBe(true);
    await vi.waitFor(() => expect(write).toHaveBeenCalled());

    const [items] = write.mock.calls[0];
    const item = items[0] as { items: Record<string, Blob> };
    const html = await blobText(item.items["text/html"]);
    expect(html).toContain("DA");
  });
});
