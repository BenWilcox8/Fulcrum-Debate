// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern the core / registry / service tests use. These
// hooks run against the *real* DocumentService (no mocks), exercising the seam
// end to end: live listings, content reactivity, and unmount cleanup.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { useEffect, useState } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";

import { DocumentsProvider } from "./DocumentsProvider";
import { DocumentsContext } from "./DocumentsContext";
import { useDocuments } from "./useDocuments";
import { useDocument } from "./useDocument";
import { useDocumentService } from "./useDocumentService";
import { openDocumentService, type DocumentService } from "../service";

// A fresh IndexedDB backend per test so nothing leaks between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Grabs the provider's live service instance so tests can assert lifecycle. */
function CaptureService({ onReady }: { onReady: (s: DocumentService) => void }) {
  const service = useDocumentService();
  useEffect(() => {
    onReady(service);
  }, [service, onReady]);
  return null;
}

describe("DocumentsProvider", () => {
  it("renders children immediately with no gate or spinner", () => {
    render(
      <DocumentsProvider>
        <div>ready</div>
      </DocumentsProvider>,
    );
    // Synchronous: present on the first paint, before any local load resolves.
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("closes its service when it unmounts", async () => {
    let service: DocumentService | undefined;
    const { unmount } = render(
      <DocumentsProvider>
        <CaptureService onReady={(s) => (service = s)} />
      </DocumentsProvider>,
    );

    expect(service).toBeDefined();
    expect(service!.closed).toBe(false);

    unmount();
    await waitFor(() => expect(service!.closed).toBe(true));
  });
});

/** Lists documents and exposes create / rename / remove as buttons. */
function ListConsumer() {
  const { documents, loading, create, rename, remove } = useDocuments();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{documents.length}</span>
      <span data-testid="titles">{documents.map((d) => d.title).join(",")}</span>
      <button
        data-testid="create"
        onClick={() => void create({ kind: "speech-doc", title: "1AC" })}
      >
        create
      </button>
      <button
        data-testid="rename"
        onClick={() => {
          const first = documents[0];
          if (first) void rename(first.id, "1AC (edited)");
        }}
      >
        rename
      </button>
      <button
        data-testid="remove"
        onClick={() => {
          const first = documents[0];
          if (first) void remove(first.id);
        }}
      >
        remove
      </button>
    </div>
  );
}

describe("useDocuments", () => {
  it("exposes an empty listing that loads, then live-updates on mutations", async () => {
    render(
      <DocumentsProvider>
        <ListConsumer />
      </DocumentsProvider>,
    );

    // The local load resolves to an empty registry.
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    // create -> the subscription re-renders the listing.
    fireEvent.click(screen.getByTestId("create"));
    await waitFor(() =>
      expect(screen.getByTestId("count")).toHaveTextContent("1"),
    );
    expect(screen.getByTestId("titles")).toHaveTextContent("1AC");

    // rename -> live title change.
    fireEvent.click(screen.getByTestId("rename"));
    await waitFor(() =>
      expect(screen.getByTestId("titles")).toHaveTextContent("1AC (edited)"),
    );

    // remove -> back to empty.
    fireEvent.click(screen.getByTestId("remove"));
    await waitFor(() =>
      expect(screen.getByTestId("count")).toHaveTextContent("0"),
    );
  });

  // Regression: a closed service can transiently sit in context during the
  // provider's StrictMode/remount service swap. `service.subscribe` throws on a
  // closed service, so an unguarded effect would crash the whole tree - which is
  // exactly what a browser reload landing directly on a document screen (e.g. a
  // round) hit, rendering a blank page. The effect must bail out on a closed
  // service instead of subscribing.
  it("does not throw when the service in context is already closed", async () => {
    const service = openDocumentService();
    await service.close();
    expect(service.closed).toBe(true);

    expect(() =>
      render(
        <DocumentsContext.Provider value={{ service }}>
          <ListConsumer />
        </DocumentsContext.Provider>,
      ),
    ).not.toThrow();

    // It stays on its empty default listing rather than crashing.
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});

/** Creates a document, opens it by id, and reflects its content reactively. */
function DocConsumer() {
  const { create } = useDocuments();
  const [id, setId] = useState<string | null>(null);
  const { handle, loaded } = useDocument(id);
  const body = handle && loaded ? handle.doc.getText("body").toString() : "";
  return (
    <div>
      <span data-testid="loaded">{String(loaded)}</span>
      <span data-testid="body">{body}</span>
      <span data-testid="hasId">{String(id !== null)}</span>
      <button
        data-testid="create-open"
        onClick={async () => {
          const h = await create({ kind: "speech-doc", title: "1AC" });
          setId(h.id);
        }}
      >
        create + open
      </button>
      <button
        data-testid="edit"
        onClick={() => handle?.doc.getText("body").insert(0, "hi")}
      >
        edit
      </button>
      <button data-testid="clear" onClick={() => setId(null)}>
        clear
      </button>
    </div>
  );
}

describe("useDocument", () => {
  it("opens a document by id and re-renders on its content changes", async () => {
    render(
      <DocumentsProvider>
        <DocConsumer />
      </DocumentsProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("create-open"));
    });

    // The handle loads its (empty) content from local storage.
    await waitFor(() =>
      expect(screen.getByTestId("loaded")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("body")).toHaveTextContent("");

    // A content edit re-renders the consumer with the new text.
    fireEvent.click(screen.getByTestId("edit"));
    await waitFor(() =>
      expect(screen.getByTestId("body")).toHaveTextContent("hi"),
    );
  });

  it("does not close the service-owned handle when the id changes", async () => {
    let service: DocumentService | undefined;
    render(
      <DocumentsProvider>
        <CaptureService onReady={(s) => (service = s)} />
        <DocConsumer />
      </DocumentsProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("create-open"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("loaded")).toHaveTextContent("true"),
    );

    const id = (await service!.list())[0].id;

    // Detach the hook (id -> null); its cleanup must not close the handle the
    // service still owns and caches.
    fireEvent.click(screen.getByTestId("clear"));
    await waitFor(() =>
      expect(screen.getByTestId("hasId")).toHaveTextContent("false"),
    );

    const handle = await service!.open(id);
    expect(handle.closed).toBe(false);
  });
});
