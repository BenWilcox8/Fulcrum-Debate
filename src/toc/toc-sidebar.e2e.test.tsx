/**
 * Whole-stack end-to-end proof for the dynamic ToC sidebar.
 *
 * The earlier ToC slices unit-tested each piece in isolation (the tree
 * derivation, the row, the pure active-heading decision, the navigate guard) and
 * the sidebar integration test drove a bare editor + `TableOfContents`. This test
 * closes the loop by exercising the feature the way the real screen composes it,
 * top to bottom, with *no mocks*: the workspace singleton
 * (`ensureBlockFile` / `useBlockFile` through the real document service and
 * IndexedDB), the shared editor primitive (`useDocumentEditor` + `EditorContent`,
 * the exact wiring `BlockFileScreen` uses), and the live `TableOfContents`
 * observing that same editor's outline.
 *
 * It proves the two user-visible behaviours the sidebar exists for, end to end:
 *
 *   1. Open the block file -> the ToC populates from the persisted document's
 *      headings across *both* enforced sides, with no manual refresh.
 *   2. Click a ToC entry -> the shared editor's selection scrolls into that
 *      heading (click-to-scroll, `navigateToHeading`).
 *   3. Scroll the document -> the highlighted ToC entry follows the section in
 *      view, across the aff/neg boundary, with only one entry ever active
 *      (current-section highlighting, `useActiveHeading` + `findActiveHeading`).
 *
 * The seed is written through a throwaway service and flushed to IndexedDB, then
 * read back through a *fresh* provider + `useBlockFile` - so the ToC is proven to
 * project a genuinely persisted document, not in-memory editor state.
 *
 * jsdom has no layout, so the scroll-highlight portion fakes it exactly as the
 * sidebar integration test does: each heading is given a content-top offset and
 * the "viewport rect moves as you scroll" relationship (rect.top = contentTop -
 * scrollTop) is modelled so `useActiveHeading`'s measurement resolves to those
 * offsets. Assertions stay behavioural (rendered labels, the editor selection,
 * the active-row marker), never ProseMirror internals or pixels.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";

import { DocumentsProvider } from "../documents/react";
import { openDocumentService } from "../documents/service";
import { useDocumentEditor } from "../editor/react";
import type { EditorPresetOptions } from "../editor/preset";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { getOutline } from "../editor/headings";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "../blockfile";
import { ensureBlockFile, useBlockFile } from "../blockfile-workspace";
import { TableOfContents } from "./TableOfContents";

// A fresh IndexedDB backend per test so nothing leaks across tests; the seed
// service and the rendered provider share this one backend - that shared backend
// *is* the persistence under test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/**
 * The block-file preset held as a module-level constant, mirroring
 * `BlockFileScreen` (the `useDocumentEditor` stable-preset contract).
 */
const BLOCK_FILE_PRESET: EditorPresetOptions = { extensions: blockFileExtensions };

/** One section node from an ordered list of `[level, text]` headings. */
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

/** A block-file document with the given aff / neg headings. */
function blockDoc(
  aff: [number, string][],
  neg: [number, string][],
): JSONContent {
  return {
    type: "doc",
    content: [section("affSection", aff), section("negSection", neg)],
  };
}

/**
 * Seeds the workspace block file with headings across both sides through a
 * throwaway service (the same seam the screen drives), then closes it - flushing
 * the writes to the shared IndexedDB backend so the rendered provider reads them
 * back as a genuinely persisted document.
 */
async function seedBlockFile(): Promise<void> {
  const service = openDocumentService();
  const id = await ensureBlockFile(service);
  const handle = await service.open(id);
  await handle.whenLoaded;

  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  editor.commands.setContent(
    blockDoc(
      [
        [1, "AT: Gold"],
        [1, "AT: Wind"],
      ],
      [[1, "AT: Solar"]],
    ),
  );
  editor.destroy();

  await service.close();
}

/**
 * A faithful stand-in for `BlockFileScreen`'s editor + ToC wiring: it opens the
 * workspace block file, owns the editor via `useDocumentEditor`, renders the
 * `TableOfContents` over that live editor, and mounts the editor inside a
 * captured scroll region handed to the sidebar. `onEditor` hands the live editor
 * back to the test so it can assert the selection and stub layout rects.
 */
function BlockFileToCHarness({ onEditor }: { onEditor: (editor: Editor) => void }) {
  const { handle, loaded, resolving } = useBlockFile();
  const ready = !resolving && loaded;

  const editor = useDocumentEditor(
    { handle, fragment: BLOCK_FILE_FRAGMENT, preset: BLOCK_FILE_PRESET },
    [handle],
  );

  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(
    null,
  );

  useEffect(() => {
    if (editor) onEditor(editor);
  }, [editor, onEditor]);

  return (
    <div className="flex gap-4">
      <TableOfContents editor={editor} scrollContainer={scrollContainer} />
      <div ref={setScrollContainer} data-testid="scroll-region">
        {!ready && <p>Opening block file…</p>}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

describe("ToC sidebar end-to-end", () => {
  it("populates from the persisted block file, navigates on click, and tracks scroll", async () => {
    await seedBlockFile();

    // Capture the live editor the screen wiring owns.
    let editor: Editor | null = null;
    const onEditor = (e: Editor) => {
      editor = e;
    };

    render(
      <DocumentsProvider>
        <BlockFileToCHarness onEditor={onEditor} />
      </DocumentsProvider>,
    );

    // 1. The ToC populates from the persisted document - headings from *both*
    //    enforced sides, each a clickable navigation target, no manual refresh.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "AT: Gold" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "AT: Wind" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "AT: Solar" }),
      ).toBeInTheDocument();
    });
    expect(editor).not.toBeNull();
    const liveEditor = editor as unknown as Editor;

    // 2. Click a neg-side entry: the shared editor's selection scrolls into that
    //    heading (click-to-scroll through navigateToHeading).
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "AT: Solar" }));
    });

    const headingAtSelection = () => {
      const { $from } = liveEditor.state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === "heading") return node.textContent;
      }
      return null;
    };
    expect(headingAtSelection()).toBe("AT: Solar");

    // 3. Scroll-highlight: model layout for jsdom by assigning each heading a
    //    content-top offset and the viewport relationship rect.top = contentTop
    //    - scrollTop, so useActiveHeading's measurement resolves to the offsets.
    const scrollRegion = screen.getByTestId("scroll-region");
    const rect = (top: number) =>
      ({
        top,
        bottom: top,
        left: 0,
        right: 0,
        height: 0,
        width: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    scrollRegion.getBoundingClientRect = () => rect(0);
    const contentTops = new Map<string, number>([
      ["AT: Gold", 0],
      ["AT: Wind", 100],
      ["AT: Solar", 250],
    ]);
    for (const { pos } of getOutline(liveEditor)) {
      const el = liveEditor.view.nodeDOM(pos) as HTMLElement;
      el.getBoundingClientRect = () =>
        rect((contentTops.get(el.textContent ?? "") ?? 0) - scrollRegion.scrollTop);
    }

    const activeLabel = () => {
      const active = document.querySelectorAll("[data-active='true']");
      // Exactly one entry is ever highlighted.
      expect(active.length).toBeLessThanOrEqual(1);
      return active[0]?.textContent ?? null;
    };

    // Force a re-measure now that the rects are stubbed (scrolled to the top:
    // the first aff section is active).
    scrollRegion.scrollTop = 0;
    act(() => scrollRegion.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(activeLabel()).toBe("AT: Gold"));

    // Scroll past AT: Wind's boundary within the aff side: the highlight follows.
    scrollRegion.scrollTop = 120;
    act(() => scrollRegion.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(activeLabel()).toBe("AT: Wind"));

    // Scroll into the neg side: AT: Solar (across the enforced aff/neg boundary)
    // becomes active, and AT: Wind is no longer highlighted.
    scrollRegion.scrollTop = 300;
    act(() => scrollRegion.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(activeLabel()).toBe("AT: Solar"));
  });
});
