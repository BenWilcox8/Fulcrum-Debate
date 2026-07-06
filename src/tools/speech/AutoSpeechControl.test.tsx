/**
 * Behavioral tests for the Auto Speech toolbar control.
 *
 * The control is the Auto Speech tool's interactive toolbar presence: a button
 * that copies the current selection's speech to the clipboard and announces the
 * result in an `aria-live` status line (the Send tool's confirmation precedent).
 * These tests drive a real block-file + card editor, stub the async clipboard,
 * and assert on the button state, the clipboard write, and the announced
 * confirmation - never on ProseMirror internals.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { createPreferenceStore } from "../../preferences";
import { createCardToolRegistry } from "../registry";
import { autoSpeechTool } from "./auto-speech";
import { AutoSpeechControl } from "./AutoSpeechControl";

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

function hl(): JSONContent["marks"] {
  return [{ type: HIGHLIGHT_MARK_NAME }];
}

function insertHighlightedCard(editor: Editor): void {
  const at = getSideRegion(editor, "aff").contentEnd;
  editor
    .chain()
    .insertContentAt(
      at,
      {
        type: "card",
        content: [
          { type: "cardTag", content: [{ type: "text", text: "T" }] },
          { type: "cardTagline", content: [{ type: "text", text: "The claim" }] },
          { type: "cardCite" },
          {
            type: "cardBody",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Read aloud.", marks: hl() }],
              },
            ],
          },
        ],
      },
      { updateSelection: false },
    )
    .run();
}

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

function stubClipboard(): ReturnType<typeof vi.fn> {
  const real = globalThis.navigator;
  const write = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", {
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

/** A registered Auto Speech tool over a fresh in-memory store. */
function registerTool() {
  const registry = createCardToolRegistry(createPreferenceStore());
  return registry.register(autoSpeechTool);
}

describe("AutoSpeechControl", () => {
  it("is disabled when no card is addressable", async () => {
    const editor = await openEditor("disabled");
    const tool = registerTool();

    render(<AutoSpeechControl editor={editor} enabled={false} settings={tool.settings} />);

    expect(screen.getByRole("button", { name: /auto speech/i })).toBeDisabled();
  });

  it("is disabled when there is no editor", () => {
    const tool = registerTool();
    render(<AutoSpeechControl editor={null} enabled={true} settings={tool.settings} />);
    expect(screen.getByRole("button", { name: /auto speech/i })).toBeDisabled();
  });

  it("copies the speech and confirms in an aria-live status line", async () => {
    const write = stubClipboard();
    const editor = await openEditor("copy");
    insertHighlightedCard(editor);
    caretInFirstBody(editor);
    const tool = registerTool();

    render(<AutoSpeechControl editor={editor} enabled={true} settings={tool.settings} />);

    const button = screen.getByRole("button", { name: /auto speech/i });
    expect(button).toBeEnabled();
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const status = screen.getByRole("status");
    await waitFor(() => expect(status.textContent).toMatch(/copied/i));
  });

  it("observes the tool's live settings when copying", async () => {
    const write = stubClipboard();
    const editor = await openEditor("live");
    insertHighlightedCard(editor);
    caretInFirstBody(editor);
    const tool = registerTool();
    // Turn the tag on through the live settings section.
    tool.settings.set("includeTag", true);

    render(<AutoSpeechControl editor={editor} enabled={true} settings={tool.settings} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /auto speech/i }));
    });

    await waitFor(() => expect(write).toHaveBeenCalled());
    const [items] = write.mock.calls[0];
    const item = items[0] as { items: Record<string, Blob> };
    const html = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(item.items["text/html"]);
    });
    expect(html).toContain("T");
  });
});
