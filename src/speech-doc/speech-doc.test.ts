// jsdom has no IndexedDB; the document layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// This drives the speech-doc model over a *real* speech-doc handle: the kind and
// fixed body fragment, and - the PRD's highest seam - a genuine close/reopen
// round-trip through a real shared-Tiptap-core editor proving rich text
// (a bold tagline) autosaves and reloads intact.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { SPEECH_DOC_BODY_FRAGMENT, SPEECH_DOC_KIND } from "./speech-doc";

// A fresh IndexedDB backend per test so persisted documents never leak.
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

/** Binds a shared-Tiptap-core editor to the speech doc's body fragment. */
const openBodyEditor = (handle: DocumentHandle) =>
  createEditor({
    binding: { handle, fragment: SPEECH_DOC_BODY_FRAGMENT },
    extensions: editorPreset(),
  });

describe("speech-doc model", () => {
  it("maps a speech doc to the `speech-doc` document kind", () => {
    expect(SPEECH_DOC_KIND).toBe("speech-doc");
  });

  it("stores rich text under the fixed `body` fragment (bound to a Yjs type forever)", () => {
    expect(SPEECH_DOC_BODY_FRAGMENT).toBe("body");
    // A single fixed name, not an id-keyed content fragment.
    expect(SPEECH_DOC_BODY_FRAGMENT).not.toContain(":");
  });
});

describe("speech-doc persistence (highest seam)", () => {
  it("autosaves rich text and reloads it intact after a close/reopen", async () => {
    const id = uniqueId();

    // First session: author a speech with a bold tagline through the real
    // shared editor, then close (flushing to IndexedDB).
    {
      const handle = await openSpeechDoc(id);
      const editor = openBodyEditor(handle);
      editor.commands.setContent(
        "<p><strong>Contention one:</strong> warming is real.</p>",
      );
      // The bold mark round-trips through Yjs, not just the raw text.
      expect(editor.getHTML()).toContain("<strong>Contention one:</strong>");
      editor.destroy();
      await handle.close();
    }

    // Second session: reopen the same document id from IndexedDB and read the
    // body back through a fresh editor - the formatting survived.
    {
      const handle = await openSpeechDoc(id);
      const editor = openBodyEditor(handle);
      const html = editor.getHTML();
      expect(html).toContain("<strong>Contention one:</strong>");
      expect(html).toContain("warming is real.");
      editor.destroy();
      await handle.close();
    }
  });

  it("is empty on a fresh speech doc until something is written", async () => {
    const handle = await openSpeechDoc();
    const fragment = handle.doc.getXmlFragment(SPEECH_DOC_BODY_FRAGMENT);
    expect(fragment.length).toBe(0);
    await handle.close();
  });

  it("isolates two speech docs - one doc's body never appears in the other", async () => {
    const firstId = uniqueId();
    const secondId = uniqueId();

    {
      const handle = await openSpeechDoc(firstId);
      openBodyEditor(handle).commands.setContent("<p>First speech body.</p>");
      await handle.close();
    }
    {
      const handle = await openSpeechDoc(secondId);
      openBodyEditor(handle).commands.setContent("<p>Second speech body.</p>");
      await handle.close();
    }

    const handle = await openSpeechDoc(firstId);
    const html = openBodyEditor(handle).getHTML();
    expect(html).toContain("First speech body.");
    expect(html).not.toContain("Second speech body.");
    await handle.close();
  });
});
