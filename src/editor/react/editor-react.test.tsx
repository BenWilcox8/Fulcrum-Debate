// jsdom has no IndexedDB; the document core reads the global, so install the
// in-memory fake before anything touches it - the same pattern the core /
// editor / documents tests use. These tests render the real React editor
// primitive over a *real* document handle (no mocks) and assert on the editable
// surface and the persisted document JSON - never on ProseMirror internals or
// pixels (contentEditable is inert under jsdom).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import { EditorContent } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../core";
import { editorPreset } from "../preset";
import { BOLD_MARK_NAME } from "../marks";
import { DocumentEditor, useDocumentEditor } from "./index";

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `doc-${Date.now()}-${nextId++}`;

/** The concatenated text of every top-level block in the document JSON. */
const editorText = (json: JSONContent): string =>
  (json.content ?? [])
    .map((block) => (block.content ?? []).map((leaf) => leaf.text ?? "").join(""))
    .join("\n");

/** The mark names on the first text leaf of the first block. */
const firstRunMarkNames = (json: JSONContent): string[] =>
  (json.content?.[0]?.content?.[0]?.marks ?? []).map((m) => m.type).sort();

/**
 * A harness that drives the real hook and both renders the editable surface and
 * hands the live editor back to the test. `DocumentEditor` is a thin wrapper
 * over exactly this hook + `EditorContent` pair, so this exercises the same path.
 */
function Harness({
  handle,
  onEditor,
}: {
  handle: DocumentHandle | null;
  onEditor: (editor: Editor | null) => void;
}) {
  const editor = useDocumentEditor({ handle, fragment: "body" });
  onEditor(editor);
  return <EditorContent editor={editor} />;
}

describe("DocumentEditor", () => {
  it("renders its container synchronously, before any editor exists", () => {
    // A null handle never produces an editor; the component must still paint its
    // container with no gate (the local-first boot rule).
    const { container } = render(
      <DocumentEditor handle={null} fragment="body" />,
    );
    expect(container.firstElementChild).not.toBeNull();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
  });

  it("mounts an editable ProseMirror surface once the handle has loaded", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
    await handle.whenLoaded;

    const { container } = render(
      <DocumentEditor handle={handle} fragment="body" />,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[contenteditable="true"].ProseMirror'),
      ).not.toBeNull();
    });

    await handle.close();
  });
});

describe("dev-mode stale-preset warning", () => {
  it("warns when preset reference changes between renders without a deps change", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });

    // A component that passes a new preset object on every render.
    let rerender: (() => void) | undefined;
    function UnstablePreset() {
      const [tick, setTick] = useState(0);
      rerender = () => setTick((t) => t + 1);
      // New object literal each render - the unstable-preset footgun.
      const editor = useDocumentEditor({
        handle,
        fragment: "body",
        preset: { extensions: [] },
      });
      return <EditorContent editor={editor} />;
    }

    render(<UnstablePreset />);

    // First render: no previous value, no warning expected.
    expect(warnSpy).not.toHaveBeenCalled();

    // Second render with a new preset object but no deps change: warning fires.
    act(() => rerender!());
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain("[useDocumentEditor]");
    expect(warnSpy.mock.calls[0][0]).toContain("preset");

    warnSpy.mockRestore();
    await handle.close();
  });

  it("does not warn when preset reference is stable across renders", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });
    const stablePreset = { extensions: [] };

    let rerender: (() => void) | undefined;
    function StablePreset() {
      const [tick, setTick] = useState(0);
      rerender = () => setTick((t) => t + 1);
      const editor = useDocumentEditor({
        handle,
        fragment: "body",
        preset: stablePreset,
      });
      return <EditorContent editor={editor} />;
    }

    render(<StablePreset />);
    act(() => rerender!());

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    await handle.close();
  });
});

describe("persistence through the document layer", () => {
  it("edits made in a React-rendered editor reload through a fresh handle", async () => {
    const id = uniqueId();

    // Session one: render the primitive over a real handle and edit through it.
    const first = openDocument({ id, kind: "speech-doc" });
    await first.whenLoaded;

    let firstEditor: Editor | null = null;
    const view = render(
      <Harness handle={first} onEditor={(e) => (firstEditor = e)} />,
    );

    await waitFor(() => expect(firstEditor).not.toBeNull());

    // Drive real edits through the editor the React tree owns, exercising a
    // preset mark (bold) so we prove the shared preset is wired in.
    act(() => {
      const editor = firstEditor as unknown as Editor;
      editor.commands.setContent("<p>contention one</p><p>contention two</p>");
      editor.commands.selectAll();
      editor.commands.toggleBold();
    });

    view.unmount();
    await first.close();

    // Session two: a genuinely separate handle + editor reads the state back out
    // of storage, proving the React-driven edits persisted through the document
    // layer.
    const second = openDocument({ id, kind: "speech-doc" });
    await second.whenLoaded;
    const secondEditor = createEditor({
      binding: { handle: second, fragment: "body" },
      extensions: editorPreset(),
    });

    expect(editorText(secondEditor.getJSON())).toBe(
      "contention one\ncontention two",
    );
    expect(firstRunMarkNames(secondEditor.getJSON())).toEqual([BOLD_MARK_NAME]);

    secondEditor.destroy();
    await second.close();
  });
});
