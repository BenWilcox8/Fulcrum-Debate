// jsdom has no IndexedDB; the document core reads the global, so install the
// in-memory fake first. These tests render the real Speech Doc editor over a
// *real* speech-doc handle (no mocks): the mounted shared-Tiptap-core surface,
// that mounting it marks the doc active, and that edits land in the body
// fragment. contentEditable is inert under jsdom, so "typing" is exercised
// through a second editor bound to the same fragment (they sync via the Y.Doc).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { SPEECH_DOC_BODY_FRAGMENT, SPEECH_DOC_KIND } from "./speech-doc";
import { createActiveSpeechDocStore } from "./active-speech-doc";
import { ActiveSpeechDocProvider } from "./ActiveSpeechDocProvider";
import { SpeechDocEditor } from "./SpeechDocEditor";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `speech-${Date.now()}-${nextId++}`;

const openSpeechDoc = async (id = uniqueId()): Promise<DocumentHandle> => {
  const handle = openDocument({ id, kind: SPEECH_DOC_KIND });
  await handle.whenLoaded;
  return handle;
};

describe("SpeechDocEditor", () => {
  it("paints its container synchronously with a null handle (local-first boot)", () => {
    const { getByTestId } = render(<SpeechDocEditor handle={null} />);
    expect(getByTestId("speech-doc-editor")).toBeTruthy();
  });

  it("mounts an editable shared-core surface once the handle has loaded", async () => {
    const handle = await openSpeechDoc();
    const { getByTestId } = render(<SpeechDocEditor handle={handle} />);
    await waitFor(() => {
      expect(
        getByTestId("speech-doc-editor").querySelector(
          '[contenteditable="true"].ProseMirror',
        ),
      ).not.toBeNull();
    });
    await handle.close();
  });

  it("marks its speech doc as the active speech doc on mount", async () => {
    const handle = await openSpeechDoc();
    const store = createActiveSpeechDocStore();
    render(
      <ActiveSpeechDocProvider store={store}>
        <SpeechDocEditor handle={handle} docId="speech-active-1" />
      </ActiveSpeechDocProvider>,
    );
    await waitFor(() => {
      expect(store.getActiveId()).toBe("speech-active-1");
    });
    await handle.close();
  });

  it("shows rich text edited into the body fragment", async () => {
    const handle = await openSpeechDoc();
    const { getByTestId } = render(
      <SpeechDocEditor handle={handle} docId="speech-2" />,
    );
    await waitFor(() => {
      expect(
        getByTestId("speech-doc-editor").querySelector(".ProseMirror"),
      ).not.toBeNull();
    });

    // Drive text into the body the way a debater's keystrokes would; a second
    // editor over the same fragment syncs through the shared Y.Doc.
    const editor = createEditor({
      binding: { handle, fragment: SPEECH_DOC_BODY_FRAGMENT },
      extensions: editorPreset(),
    });
    editor.commands.setContent("<p><strong>Tagline:</strong> the plan solves.</p>");

    await waitFor(() => {
      expect(getByTestId("speech-doc-editor").textContent).toContain(
        "the plan solves.",
      );
    });
    expect(
      getByTestId("speech-doc-editor").querySelector("strong"),
    ).not.toBeNull();

    editor.destroy();
    await handle.close();
  });
});
