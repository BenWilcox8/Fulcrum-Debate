// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern the document / editor / rounds layers use. These
// tests drive the block-file workspace end to end through the *real*
// DocumentService (no mocks): the routed screen, the workspace singleton seam,
// and the shared editor primitive over the block-file schema. Assertions are
// behavioral (persisted document text, rendered structure), never pixels -
// contentEditable is inert under jsdom.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { JSONContent } from "@tiptap/core";

import AppRoutes from "../AppRoutes";
import { DocumentsProvider } from "../documents/react";
import { DocumentsContext } from "../documents/react/DocumentsContext";
import { openDocumentService, type DocumentService } from "../documents/service";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "../blockfile";
import { BLOCK_FILE_KIND, ensureBlockFile } from "./workspace";

// A fresh IndexedDB backend per test so nothing leaks between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Renders the routed shell at `path` inside a fresh document provider. */
function renderShellAt(path: string) {
  return render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </DocumentsProvider>,
  );
}

/** A two-section block-file document with the given aff / neg body text. */
function blockDoc(affText: string, negText: string): JSONContent {
  const section = (type: string, text: string): JSONContent => ({
    type,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
  return {
    type: "doc",
    content: [section("affSection", affText), section("negSection", negText)],
  };
}

/**
 * Seeds the workspace block file with aff / neg text against a throwaway service
 * instance (mirroring how the screen drives the same seam), then closes it -
 * flushing the writes to the shared IndexedDB backend so a fresh instance can
 * read them back.
 */
async function seedBlockFile(affText: string, negText: string): Promise<string> {
  const service = openDocumentService();
  const id = await ensureBlockFile(service);
  const handle = await service.open(id);
  await handle.whenLoaded;

  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  editor.commands.setContent(blockDoc(affText, negText));
  editor.destroy();

  await service.close();
  return id;
}

describe("block-file workspace screen", () => {
  it("renders the Block File heading and description synchronously", () => {
    renderShellAt("/blocks");

    expect(
      screen.getByRole("heading", { level: 2, name: /^block file$/i }),
    ).toBeInTheDocument();
  });

  it("opens a fresh block file with both enforced side regions in one document", async () => {
    const { container } = renderShellAt("/blocks");

    // The singleton is created on first visit and its editor mounts once the
    // local load resolves - a single continuous surface with an aff region above
    // a neg region.
    await waitFor(() => {
      expect(
        container.querySelector('[contenteditable="true"].ProseMirror'),
      ).not.toBeNull();
    });

    const editor = container.querySelector(".ProseMirror")!;
    expect(editor.querySelector('section[data-side="aff"]')).not.toBeNull();
    expect(editor.querySelector('section[data-side="neg"]')).not.toBeNull();
  });

  it("restores edits across a fresh-instance reload", async () => {
    // Session one: seed both sides against one service instance, then throw it
    // away (flushing to IndexedDB on close).
    await seedBlockFile("AFF EVIDENCE", "NEG EVIDENCE");

    // Session two: a completely fresh provider over the same backend reopens the
    // same singleton block file and restores its content.
    renderShellAt("/blocks");

    expect(await screen.findByText("AFF EVIDENCE")).toBeInTheDocument();
    expect(await screen.findByText("NEG EVIDENCE")).toBeInTheDocument();
  });

  it("reuses the one workspace block file rather than creating another", async () => {
    // Two visits (each an independent service instance, as a relaunch would be).
    await seedBlockFile("first", "second");
    const view = renderShellAt("/blocks");
    await screen.findByText("first");
    view.unmount();
    renderShellAt("/blocks");
    await screen.findByText("first");

    // Exactly one block-file document exists in the shared registry.
    const service = openDocumentService();
    await service.whenReady;
    const blockFiles = (await service.list()).filter(
      (entry) => entry.kind === BLOCK_FILE_KIND,
    );
    expect(blockFiles).toHaveLength(1);
    await service.close();
  });
});

describe("ensureBlockFile", () => {
  it("returns the same id for concurrent and repeat calls on one service", async () => {
    const service = openDocumentService();
    const [a, b] = await Promise.all([
      ensureBlockFile(service),
      ensureBlockFile(service),
    ]);
    const c = await ensureBlockFile(service);

    expect(a).toBe(b);
    expect(b).toBe(c);

    const blockFiles = (await service.list()).filter(
      (entry) => entry.kind === BLOCK_FILE_KIND,
    );
    expect(blockFiles).toHaveLength(1);
    await service.close();
  });
});

describe("useBlockFile error and retry", () => {
  /** Wraps BlockFileScreen in a DocumentsContext that uses the given service. */
  function renderScreenWithService(service: DocumentService) {
    return render(
      <DocumentsContext.Provider value={{ service }}>
        <MemoryRouter initialEntries={["/blocks"]}>
          <AppRoutes />
        </MemoryRouter>
      </DocumentsContext.Provider>,
    );
  }

  it("shows an error message and Retry button when ensureBlockFile rejects", async () => {
    const service = openDocumentService();
    vi.spyOn(service, "list").mockRejectedValue(new Error("IndexedDB failure"));

    renderScreenWithService(service);

    await waitFor(() => {
      expect(screen.getByText(/could not open block file/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

    vi.restoreAllMocks();
    await service.close();
  });

  it("retries and recovers after a transient failure", async () => {
    const service = openDocumentService();
    const realList = service.list.bind(service);
    let calls = 0;
    vi.spyOn(service, "list").mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.reject(new Error("transient"));
      return realList();
    });

    renderScreenWithService(service);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    });

    vi.restoreAllMocks();
    await service.close();
  });
});
