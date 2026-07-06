// The live ToC sidebar, driven over a *real* block-file editor + handle (no
// mocks), the established pattern (fake-indexeddb + fresh IDBFactory per test).
// It proves the sidebar lists headings from both enforced sides, nested per the
// tree derivation, and reacts to add / rename / delete without a manual refresh.
// Assertions are behavioral (rendered heading labels), never ProseMirror
// internals or pixels (contentEditable is inert under jsdom).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "../blockfile";
import { TableOfContents } from "./TableOfContents";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `toc-doc-${Date.now()}-${nextId++}`;

/** One section node with an ordered list of `[level, text]` headings. */
function section(
  type: "affSection" | "negSection",
  headings: [number, string][],
): JSONContent {
  return {
    type,
    content: headings.map(([level, text]) => ({
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text }],
    })),
  };
}

/** A block-file doc with the given aff / neg headings. */
function blockDoc(
  aff: [number, string][],
  neg: [number, string][],
): JSONContent {
  return {
    type: "doc",
    content: [section("affSection", aff), section("negSection", neg)],
  };
}

/** Opens a real block-file handle + editor bound to its body fragment. */
async function openBlockEditor(): Promise<{
  handle: DocumentHandle;
  editor: Editor;
}> {
  const handle = openDocument({ id: uniqueId(), kind: "block-file" });
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  return { handle, editor };
}

/** Renders the sidebar against a live editor handed back for manipulation. */
function Harness({ editor }: { editor: Editor | null }) {
  const [e] = useState(editor);
  return <TableOfContents editor={e} />;
}

describe("TableOfContents", () => {
  it("lists headings from both the aff and neg sides", async () => {
    const { editor } = await openBlockEditor();
    act(() => {
      editor.commands.setContent(
        blockDoc([[1, "AT: Gold"]], [[1, "AT: Fusion"]]),
      );
    });

    render(<Harness editor={editor} />);

    await waitFor(() => {
      expect(screen.getByText("AT: Gold")).toBeInTheDocument();
      expect(screen.getByText("AT: Fusion")).toBeInTheDocument();
    });

    editor.destroy();
  });

  it("nests a deeper heading under its shallower parent", async () => {
    const { editor } = await openBlockEditor();
    act(() => {
      editor.commands.setContent(
        blockDoc(
          [
            [1, "Parent"],
            [2, "Child"],
          ],
          [],
        ),
      );
    });

    render(<Harness editor={editor} />);

    await waitFor(() => {
      expect(screen.getByText("Parent")).toBeInTheDocument();
    });

    // The child sits inside the parent's row subtree, not at the top level.
    const child = screen.getByText("Child");
    const parent = screen.getByText("Parent");
    const parentItem = parent.closest("li");
    expect(parentItem).not.toBeNull();
    expect(parentItem).toContainElement(child);

    editor.destroy();
  });

  it("reacts to a heading being added, renamed, and deleted", async () => {
    const { editor } = await openBlockEditor();
    act(() => {
      editor.commands.setContent(blockDoc([[1, "First"]], []));
    });

    render(<Harness editor={editor} />);
    await waitFor(() => expect(screen.getByText("First")).toBeInTheDocument());

    // Add a heading.
    act(() => {
      editor.commands.setContent(
        blockDoc(
          [
            [1, "First"],
            [1, "Second"],
          ],
          [],
        ),
      );
    });
    await waitFor(() => expect(screen.getByText("Second")).toBeInTheDocument());

    // Rename it.
    act(() => {
      editor.commands.setContent(
        blockDoc(
          [
            [1, "First"],
            [1, "Renamed"],
          ],
          [],
        ),
      );
    });
    await waitFor(() => expect(screen.getByText("Renamed")).toBeInTheDocument());
    expect(screen.queryByText("Second")).toBeNull();

    // Delete it.
    act(() => {
      editor.commands.setContent(blockDoc([[1, "First"]], []));
    });
    await waitFor(() => expect(screen.queryByText("Renamed")).toBeNull());
    expect(screen.getByText("First")).toBeInTheDocument();

    editor.destroy();
  });

  it("renders an empty state when there are no headings and no editor", () => {
    render(<Harness editor={null} />);
    // Persistent region present even with nothing to show.
    expect(
      screen.getByRole("navigation", { name: /contents/i }),
    ).toBeInTheDocument();
  });
});
