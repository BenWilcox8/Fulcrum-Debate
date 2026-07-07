// jsdom has no IndexedDB, so install the in-memory fake before anything reads the
// global. These tests drive the block-file ToC bulk-send panel end to end through
// the *real* DocumentService: checking heading rows, then Send to Speech Doc
// appends the checked sections' cards to the active speech doc - plus the
// deliberate no-active-speech-doc affordance and the empty-selection gate.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { useState } from "react";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";

import { DocumentsProvider, useDocumentService } from "../documents/react";
import { openDocument, type DocumentHandle } from "../documents/core";
import type { DocumentService } from "../documents/service";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { HEADING_LEVELS } from "../editor/headings";
import { HIGHLIGHT_MARK_NAME } from "../editor/marks";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  getSideRegion,
  addSection,
} from "../blockfile";
import {
  ActiveSpeechDocProvider,
  createActiveSpeechDocStore,
  SPEECH_DOC_BODY_FRAGMENT,
  type ActiveSpeechDocStore,
} from "../speech-doc";
import { BlockFileTocPanel } from "./BlockFileTocPanel";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  handles = [];
});

function cardWith(fields: {
  tagline: string;
  cite: string;
  body: { text: string; highlight?: boolean }[];
}): JSONContent {
  return {
    type: "card",
    content: [
      { type: "cardTag", content: [{ type: "text", text: "T" }] },
      { type: "cardTagline", content: [{ type: "text", text: fields.tagline }] },
      { type: "cardCite", content: [{ type: "text", text: fields.cite }] },
      {
        type: "cardBody",
        content: [
          {
            type: "paragraph",
            content: fields.body.map((run) => ({
              type: "text",
              text: run.text,
              ...(run.highlight
                ? { marks: [{ type: HIGHLIGHT_MARK_NAME }] }
                : {}),
            })),
          },
        ],
      },
    ],
  };
}

function appendCard(editor: Editor, card: JSONContent): void {
  const at = getSideRegion(editor, "aff").contentEnd;
  editor.chain().insertContentAt(at, card, { updateSelection: false }).run();
}

/** A block-file editor with two argument sections, each holding a card. */
async function buildBlockFile(id: string): Promise<Editor> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
      headingLevels: HEADING_LEVELS,
    }),
  });
  editors.push(editor);
  addSection(editor, "aff", "Gold");
  appendCard(
    editor,
    cardWith({
      tagline: "Gold solves warming",
      cite: "Smith 24",
      body: [{ text: "read this aloud", highlight: true }],
    }),
  );
  addSection(editor, "aff", "Fusion");
  appendCard(
    editor,
    cardWith({
      tagline: "Fusion is near",
      cite: "Lee 25",
      body: [{ text: "fusion soon", highlight: true }],
    }),
  );
  return editor;
}

function speechText(handle: DocumentHandle): string {
  const editor = createEditor({
    binding: { handle, fragment: SPEECH_DOC_BODY_FRAGMENT },
    extensions: editorPreset(),
  });
  editors.push(editor);
  return editor.getText();
}

interface Harness {
  service: DocumentService;
  setEditor: (editor: Editor | null) => void;
}

let harness: Harness | null = null;

function HarnessComponent() {
  const service = useDocumentService();
  const [editor, setEditor] = useState<Editor | null>(null);
  harness = { service, setEditor };
  return <BlockFileTocPanel editor={editor} />;
}

function renderPanel(store: ActiveSpeechDocStore) {
  harness = null;
  render(
    <DocumentsProvider>
      <ActiveSpeechDocProvider store={store}>
        <HarnessComponent />
      </ActiveSpeechDocProvider>
    </DocumentsProvider>,
  );
}

describe("BlockFileTocPanel", () => {
  it("renders a checkbox per heading and supports multi-check", async () => {
    renderPanel(createActiveSpeechDocStore());
    await waitFor(() => expect(harness).not.toBeNull());
    const editor = await buildBlockFile("panel-1");
    act(() => harness!.setEditor(editor));

    const gold = await screen.findByLabelText(/Include Gold in speech/i);
    const fusion = screen.getByLabelText(/Include Fusion in speech/i);
    expect(gold).not.toBeChecked();
    expect(fusion).not.toBeChecked();

    fireEvent.click(gold);
    fireEvent.click(fusion);
    expect(screen.getByLabelText(/Include Gold in speech/i)).toBeChecked();
    expect(screen.getByLabelText(/Include Fusion in speech/i)).toBeChecked();
  });

  it("disables Send until at least one heading is checked", async () => {
    renderPanel(createActiveSpeechDocStore());
    await waitFor(() => expect(harness).not.toBeNull());
    const editor = await buildBlockFile("panel-2");
    act(() => harness!.setEditor(editor));

    await screen.findByLabelText(/Include Gold in speech/i);
    expect(screen.getByTestId("send-toc-to-speech")).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Include Gold in speech/i));
    expect(screen.getByTestId("send-toc-to-speech")).toBeEnabled();
  });

  it("appends the checked sections to the active speech doc and clears the selection", async () => {
    const store = createActiveSpeechDocStore();
    renderPanel(store);
    await waitFor(() => expect(harness).not.toBeNull());
    const editor = await buildBlockFile("panel-3");
    act(() => harness!.setEditor(editor));

    const speech = await harness!.service.create({
      kind: "speech-doc",
      title: "1AC",
    });
    act(() => store.setActiveId(speech.id));

    fireEvent.click(await screen.findByLabelText(/Include Gold in speech/i));
    fireEvent.click(screen.getByTestId("send-toc-to-speech"));

    await waitFor(() =>
      expect(speechText(speech)).toContain("Gold solves warming"),
    );
    expect(speechText(speech)).not.toContain("Fusion is near");
    // Selection clears; the block file is untouched.
    await waitFor(() =>
      expect(screen.getByLabelText(/Include Gold in speech/i)).not.toBeChecked(),
    );
    expect(screen.getByTestId("send-toc-to-speech-status").textContent).toMatch(
      /sent 1 section/i,
    );
    expect(editor.getText()).toContain("read this aloud");
  });

  it("shows a deliberate affordance and sends nothing with no active speech doc", async () => {
    renderPanel(createActiveSpeechDocStore());
    await waitFor(() => expect(harness).not.toBeNull());
    const editor = await buildBlockFile("panel-4");
    act(() => harness!.setEditor(editor));

    fireEvent.click(await screen.findByLabelText(/Include Gold in speech/i));
    fireEvent.click(screen.getByTestId("send-toc-to-speech"));

    await waitFor(() =>
      expect(
        screen.getByTestId("send-toc-to-speech-status").textContent,
      ).toMatch(/no active speech doc/i),
    );
    // The selection is preserved so the debater can pick a target and retry.
    expect(screen.getByLabelText(/Include Gold in speech/i)).toBeChecked();
  });
});
