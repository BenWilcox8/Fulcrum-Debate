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
import { getOutline } from "../editor/headings";
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

  it("highlights the section in view and moves the highlight as the document scrolls", async () => {
    // jsdom has no layout, so we fake it: mount the editor inside a scroll
    // container, assign each heading a content-top offset, and model the real
    // "viewport rect moves as you scroll" relationship (rect.top = contentTop -
    // scrollTop) so the hook's measurement resolves to the assigned offsets.
    const container = document.createElement("div");
    document.body.appendChild(container);

    const handle = openDocument({ id: uniqueId(), kind: "block-file" });
    await handle.whenLoaded;
    const editor = createEditor({
      binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
      extensions: editorPreset({ extensions: blockFileExtensions }),
      element: container,
    });
    act(() => {
      editor.commands.setContent(
        blockDoc(
          [
            [1, "Alpha"],
            [1, "Beta"],
          ],
          [[1, "Gamma"]],
        ),
      );
    });

    const rect = (top: number) => ({ top, bottom: top, left: 0, right: 0, height: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    container.getBoundingClientRect = () => rect(0);
    const contentTops = new Map<string, number>([
      ["Alpha", 0],
      ["Beta", 100],
      ["Gamma", 250],
    ]);
    for (const { pos } of getOutline(editor)) {
      const el = editor.view.nodeDOM(pos) as HTMLElement;
      const contentTop = contentTops.get(el.textContent ?? "") ?? 0;
      el.getBoundingClientRect = () => rect(contentTop - container.scrollTop);
    }

    render(<TableOfContents editor={editor} scrollContainer={container} />);

    const activeLabel = () => {
      const active = document.querySelectorAll("[data-active='true']");
      // Only ever one entry highlighted at a time.
      expect(active.length).toBeLessThanOrEqual(1);
      return active[0]?.textContent ?? null;
    };

    // Scrolled to the top: the first section is active.
    await waitFor(() => expect(activeLabel()).toBe("Alpha"));

    // Scroll past Beta's boundary: the highlight follows.
    container.scrollTop = 120;
    act(() => container.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(activeLabel()).toBe("Beta"));

    // Scroll into the neg side: Gamma (across the enforced boundary) becomes
    // active, and Beta is no longer highlighted.
    container.scrollTop = 300;
    act(() => container.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(activeLabel()).toBe("Gamma"));

    editor.destroy();
    container.remove();
  });
});
