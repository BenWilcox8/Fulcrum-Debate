// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the document core persists through it. Tiptap itself needs only
// the jsdom DOM that the vitest environment already provides; no extra shim.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import type { JSONContent } from "@tiptap/core";

import { openDocument } from "../../documents/core";
import { createEditor } from "./editor-core";

/**
 * These tests assert observable behavior on the editor's public API and the
 * resulting document - text/JSON round-trips through the document layer, and two
 * editors on one fragment converging - never ProseMirror plugin internals.
 */

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `doc-${Date.now()}-${nextId++}`;

/** Flattens a Tiptap doc's text content for concise behavioral assertions. */
const editorText = (json: JSONContent): string =>
  (json.content ?? [])
    .map((node) => (node.content ?? []).map((leaf) => leaf.text ?? "").join(""))
    .join("\n");

describe("createEditor", () => {
  it("binds an editor to a named fragment of a document-core Y.Doc", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
    await handle.whenLoaded;

    const editor = createEditor({ binding: { handle, fragment: "body" } });

    editor.commands.setContent("<p>1AC framework</p>");
    expect(editor.getText()).toBe("1AC framework");

    // The edit landed in the bound XmlFragment, not just editor-local state.
    expect(handle.doc.getXmlFragment("body").length).toBeGreaterThan(0);

    editor.destroy();
    await handle.close();
  });

  it("rejects an empty fragment name", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
    await handle.whenLoaded;

    expect(() => createEditor({ binding: { handle, fragment: "" } })).toThrow(
      /non-empty/,
    );

    await handle.close();
  });

  it("keeps distinct fragment names as independent surfaces", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "block-file" });
    await handle.whenLoaded;

    const bodyEditor = createEditor({ binding: { handle, fragment: "body" } });
    const notesEditor = createEditor({ binding: { handle, fragment: "notes" } });

    bodyEditor.commands.setContent("<p>evidence</p>");
    notesEditor.commands.setContent("<p>cut this tighter</p>");

    expect(bodyEditor.getText()).toBe("evidence");
    expect(notesEditor.getText()).toBe("cut this tighter");

    bodyEditor.destroy();
    notesEditor.destroy();
    await handle.close();
  });
});

describe("persistence through the document layer", () => {
  it("edits persist and reload through a fresh document handle", async () => {
    const id = uniqueId();

    const first = openDocument({ id, kind: "speech-doc" });
    await first.whenLoaded;
    const firstEditor = createEditor({
      binding: { handle: first, fragment: "body" },
    });
    firstEditor.commands.setContent("<p>contention one</p><p>contention two</p>");
    firstEditor.destroy();
    await first.close();

    // A genuinely separate handle + editor reads the state back out of storage.
    const second = openDocument({ id, kind: "speech-doc" });
    await second.whenLoaded;
    const secondEditor = createEditor({
      binding: { handle: second, fragment: "body" },
    });

    expect(editorText(secondEditor.getJSON())).toBe(
      "contention one\ncontention two",
    );

    secondEditor.destroy();
    await second.close();
  });

  it("accumulates edits made across multiple sessions", async () => {
    const id = uniqueId();

    const s1 = openDocument({ id, kind: "speech-doc" });
    await s1.whenLoaded;
    const e1 = createEditor({ binding: { handle: s1, fragment: "body" } });
    e1.commands.setContent("<p>first pass</p>");
    e1.destroy();
    await s1.close();

    const s2 = openDocument({ id, kind: "speech-doc" });
    await s2.whenLoaded;
    const e2 = createEditor({ binding: { handle: s2, fragment: "body" } });
    // Append a paragraph at the end of the existing content.
    e2.commands.focus("end");
    e2.commands.insertContent("<p>second pass</p>");
    expect(editorText(e2.getJSON())).toBe("first pass\nsecond pass");
    e2.destroy();
    await s2.close();

    const s3 = openDocument({ id, kind: "speech-doc" });
    await s3.whenLoaded;
    const e3 = createEditor({ binding: { handle: s3, fragment: "body" } });
    expect(editorText(e3.getJSON())).toBe("first pass\nsecond pass");
    e3.destroy();
    await s3.close();
  });
});

describe("Yjs binding without a cursor layer", () => {
  it("two editors on the same document + fragment converge", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "flow-sheet" });
    await handle.whenLoaded;

    // Two editors bound to the same fragment of the same doc. Yjs propagates
    // each edit to the shared type, so both observe the union - no awareness,
    // provider, or cursor layer involved.
    const a = createEditor({ binding: { handle, fragment: "columns" } });
    const b = createEditor({ binding: { handle, fragment: "columns" } });

    a.commands.setContent("<p>from A</p>");
    expect(b.getText()).toBe("from A");

    b.commands.focus("end");
    b.commands.insertContent("<p>from B</p>");
    expect(editorText(a.getJSON())).toBe("from A\nfrom B");

    a.destroy();
    b.destroy();
    await handle.close();
  });
});
