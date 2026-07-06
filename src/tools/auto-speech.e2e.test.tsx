/**
 * Whole-stack end-to-end proof for the **Auto Speech** PRD (its 3/3 closeout) - the
 * pure transform engine (`src/speech`) and the clipboard toolbar tool
 * (`src/tools/speech`) composed the way the Block File screen ships them, driven
 * through the *real* toolbar with no mocks beyond the browser clipboard surface
 * jsdom does not implement.
 *
 * A debater selects a run of cards (across an argument-section header) and clicks
 * the Auto Speech button on the card toolbar; the speech lands on the clipboard as
 * rich text + plain text, shaped by the tool's live settings. This test builds that
 * exact stack:
 *
 *   - the exact block-file + card preset the Block File screen ships;
 *   - a genuinely *persistent* shared preference store (`openPreferenceStore`), the
 *     same backend the Settings screen edits, so a settings change is the real one;
 *   - the real `useCardTools` -> `CardToolbar` -> `AutoSpeechControl` chain (the
 *     tool is enumerated among every shipped tool and rendered via its
 *     `renderControl`, exactly as the screen renders it).
 *
 * It proves the Auto Speech transform rules end to end, observed on the *actual*
 * clipboard payload the button writes:
 *
 *   1. the tagline is **bold** (`<strong>` in the HTML flavour);
 *   2. the highlighted read-aloud runs become **plain** text (no `<mark>`);
 *   3. **un-highlighted** body text is stripped entirely;
 *   4. a **separator** line divides two adjacent cards, and a **section header**
 *      between two cards is preserved as a heading and needs no extra separator;
 *   5. a **settings change** (turning the tag on through the shared store, the same
 *      section the Settings screen edits) is observed live by the next copy.
 *
 * The clipboard is stubbed because jsdom ships no `navigator.clipboard`/
 * `ClipboardItem`; every assertion reads the real blobs the tool wrote (via
 * `FileReader`, since jsdom's `Blob` has no `.text()`). Positions that drive the
 * selection come from an independent substring walk, never the tool under test -
 * the same discipline as `card-cutting-tools.e2e.test.tsx`. Follows the
 * `tools.e2e` / `card.e2e` / `formatting.e2e` closeout precedent.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { HIGHLIGHT_MARK_NAME } from "../editor/marks";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  cardCreate,
  getSideRegion,
} from "../blockfile";
import {
  PreferenceStoreProvider,
  openPreferenceStore,
  type PersistentPreferenceStore,
} from "../preferences";
import { createCardToolRegistry } from "./registry";
import { autoSpeechTool, type AutoSpeechToolSettings } from "./speech";
import type { SectionHandle } from "../preferences";
import { useCardTools } from "./react/useCardTools";
import { CardToolbar } from "./react/CardToolbar";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];
let stores: PersistentPreferenceStore[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  cleanup();
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  for (const store of stores) await store.close();
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
    // The exact preset the Block File screen ships.
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions, cardCreate],
    }),
  });
  editors.push(editor);
  return editor;
}

function hl(): JSONContent["marks"] {
  return [{ type: HIGHLIGHT_MARK_NAME }];
}

/** A full card node with distinct plain / highlighted body runs. */
function card(fields: {
  tag: string;
  tagline: string;
  cite: string;
  body: JSONContent[];
}): JSONContent {
  return {
    type: "card",
    content: [
      { type: "cardTag", content: [{ type: "text", text: fields.tag }] },
      { type: "cardTagline", content: [{ type: "text", text: fields.tagline }] },
      { type: "cardCite", content: [{ type: "text", text: fields.cite }] },
      { type: "cardBody", content: fields.body },
    ],
  };
}

/**
 * Seed the aff side with three cards and a section header between the 2nd and 3rd:
 * [card A, card B, heading "Impacts", card C]. Adjacent cards A and B exercise the
 * separator; the header exercises header-as-divider (no separator around it). Each
 * body has a highlighted read-aloud run flanked by un-highlighted prose.
 */
function seed(editor: Editor): void {
  const at = getSideRegion(editor, "aff").contentEnd;
  const content: JSONContent[] = [
    card({
      tag: "TAGX",
      tagline: "Warming is real",
      cite: "Smith 24",
      body: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Intro alpha. " },
            { type: "text", text: "Read A aloud.", marks: hl() },
            { type: "text", text: " Trailing alpha." },
          ],
        },
      ],
    }),
    card({
      tag: "DAX",
      tagline: "Link is strong",
      cite: "Lee 22",
      body: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Read B aloud.", marks: hl() },
            { type: "text", text: " Trailing bravo." },
          ],
        },
      ],
    }),
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Impacts" }],
    },
    card({
      tag: "CPX",
      tagline: "Counterplan solves",
      cite: "Jones 23",
      body: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Setup charlie. " },
            { type: "text", text: "Read C aloud.", marks: hl() },
          ],
        },
      ],
    }),
  ];
  editor.chain().insertContentAt(at, content, { updateSelection: false }).run();
}

/** The document range of the first occurrence of `substring`, by text-node offset. */
function rangeOf(editor: Editor, substring: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range) return false;
    if (node.isText && node.text && node.text.includes(substring)) {
      const offset = node.text.indexOf(substring);
      range = { from: pos + offset, to: pos + offset + substring.length };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`rangeOf: no run containing "${substring}"`);
  return range;
}

/**
 * Select from the start of the first card's tagline to the end of the last card's
 * read-aloud run - a range spanning every card and the header. The `from` sits
 * inside card A, so `getSelectedCard` resolves and the toolbar's Auto Speech
 * button enables; the range wraps every whole card + the heading for the engine.
 */
function selectSpan(editor: Editor): void {
  const from = rangeOf(editor, "Warming is real").from;
  const to = rangeOf(editor, "Read C aloud.").to;
  editor.commands.setTextSelection({ from, to });
}

/** Run an editor mutation inside `act` (the toolbar re-renders on transactions). */
function act1(fn: () => void): void {
  act(() => {
    fn();
  });
}

/** Stub the async clipboard jsdom lacks, capturing every `write` call's items. */
function stubClipboard(): ReturnType<typeof vi.fn> {
  const real = globalThis.navigator;
  const write = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
    // Tiptap's isiOS reads platform/userAgent at editor creation - preserve them.
    platform: real?.platform ?? "",
    userAgent: real?.userAgent ?? "",
    clipboard: { write, writeText: vi.fn().mockResolvedValue(undefined) },
  });
  class ClipboardItemStub {
    constructor(public items: Record<string, Blob>) {}
  }
  vi.stubGlobal("ClipboardItem", ClipboardItemStub);
  return write;
}

/** Read a Blob's text (jsdom's Blob has no `.text()`). */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** The `{ html, text }` of the Nth (default: latest) clipboard write. */
async function payloadOf(
  write: ReturnType<typeof vi.fn>,
  callIndex = write.mock.calls.length - 1,
): Promise<{ html: string; text: string }> {
  const [items] = write.mock.calls[callIndex];
  const item = items[0] as { items: Record<string, Blob> };
  return {
    html: await blobText(item.items["text/html"]),
    text: await blobText(item.items["text/plain"]),
  };
}

/** Render the real toolbar over the shared store, exactly as the screen wires it. */
function ToolbarHost({ editor }: { editor: Editor }) {
  const tools = useCardTools();
  return <CardToolbar editor={editor} tools={tools} />;
}

const DOC_ID = "auto-speech-e2e";

describe("auto speech end-to-end", () => {
  it("copies a multi-card selection to the clipboard as a speech, and a settings change alters the output", async () => {
    const write = stubClipboard();
    const editor = await openEditor(DOC_ID);
    act1(() => seed(editor));

    // One persistent store, shared by the toolbar and (in the app) the Settings
    // screen. A separate registry over the same store gives us the live settings
    // handle - registration is idempotent, so this is the very section the
    // toolbar's Auto Speech control reads.
    const store = openPreferenceStore();
    stores.push(store);
    await store.whenLoaded;
    const settings = createCardToolRegistry(store).register(autoSpeechTool)
      .settings as SectionHandle<AutoSpeechToolSettings>;

    render(
      <PreferenceStoreProvider store={store}>
        <ToolbarHost editor={editor} />
      </PreferenceStoreProvider>,
    );

    // Select the span of all three cards + the header; the caret's card resolves,
    // so the Auto Speech button enables.
    act1(() => selectSpan(editor));
    const button = screen.getByRole("button", { name: /auto speech/i });
    expect(button).toBeEnabled();

    // --- 1) Default copy: the standard speech. ------------------------------
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const first = await payloadOf(write);

    // Tagline is bold (HTML flavour), for all three cards.
    expect(first.html).toContain("<strong>Warming is real</strong>");
    expect(first.html).toContain("<strong>Link is strong</strong>");
    expect(first.html).toContain("<strong>Counterplan solves</strong>");

    // Highlighted read-aloud runs are plain text, never a <mark>.
    expect(first.text).toContain("Read A aloud.");
    expect(first.text).toContain("Read B aloud.");
    expect(first.text).toContain("Read C aloud.");
    expect(first.html).not.toContain("<mark");

    // Un-highlighted body text is stripped entirely.
    expect(first.text).not.toContain("Intro alpha.");
    expect(first.text).not.toContain("Trailing alpha.");
    expect(first.text).not.toContain("Trailing bravo.");
    expect(first.text).not.toContain("Setup charlie.");

    // Cites are read aloud.
    expect(first.text).toContain("Smith 24");

    // Adjacent cards A and B are divided by the separator line...
    expect(first.text).toContain("---");
    // ...and the section header is preserved as a heading (no extra separator
    // around it: the header sits directly between the B and C blocks).
    expect(first.html).toContain("<h1>Impacts</h1>");
    expect(first.text).not.toContain("---\nImpacts");
    expect(first.text).not.toContain("Impacts\n---");

    // The tag is a tactical label, off by default - it is absent from the speech.
    expect(first.text).not.toContain("TAGX");
    expect(first.text).not.toContain("CPX");

    // --- 2) Settings change: turn the tag on through the shared store section
    //        (the same section the Settings screen edits) and re-copy. --------
    act1(() => settings.set("includeTag", true));
    // The selection is unchanged, so the button stays enabled.
    expect(button).toBeEnabled();
    await act(async () => {
      fireEvent.click(button);
    });
    await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
    const second = await payloadOf(write);

    // The live settings change is observed: every card's tag now appears.
    expect(second.text).toContain("TAGX");
    expect(second.text).toContain("DAX");
    expect(second.text).toContain("CPX");
    // The rest of the speech is unchanged (still bold tagline, still stripped).
    expect(second.html).toContain("<strong>Warming is real</strong>");
    expect(second.text).not.toContain("Intro alpha.");
  });
});
