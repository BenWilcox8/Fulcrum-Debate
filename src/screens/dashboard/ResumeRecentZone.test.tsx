// The Resume/Recent zone reads the live document listing through the document
// service seam. Two kinds of test live here:
//   1. Presentational/ordering/empty-state tests drive the zone directly over a
//      stub DocumentService (full control of the listing, incl. recency order).
//   2. A navigation test mounts the real routed app over a real, IndexedDB-backed
//      service (jsdom has none, so install the in-memory fake, per the
//      document-layer test pattern) to prove one-click resume lands in the right
//      editor with that document open.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ResumeRecentZone from "./ResumeRecentZone";
import AppRoutes from "../../AppRoutes";
import { DocumentsProvider } from "../../documents/react";
import { DocumentsContext } from "../../documents/react/DocumentsContext";
import { openDocumentService } from "../../documents/service";
import type { DocumentService, RegistryEntry } from "../../documents/service";

// A fresh IndexedDB backend per test so nothing leaks between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** A minimal DocumentService whose `list()` returns a fixed, ordered listing. */
function stubService(entries: RegistryEntry[]): DocumentService {
  return {
    whenReady: Promise.resolve(),
    list: async () => entries,
    subscribe: () => () => {},
  } as unknown as DocumentService;
}

function entry(over: Partial<RegistryEntry> & Pick<RegistryEntry, "id" | "kind">): RegistryEntry {
  return {
    title: over.title ?? over.id,
    createdAt: over.createdAt ?? 0,
    lastEditedAt: over.lastEditedAt ?? over.createdAt ?? 0,
    ...over,
  };
}

/** Renders the zone over a stubbed listing inside a router (for `<Link>`s). */
function renderZone(entries: RegistryEntry[]) {
  return render(
    <DocumentsContext.Provider value={{ service: stubService(entries) }}>
      <MemoryRouter initialEntries={["/"]}>
        <ResumeRecentZone />
      </MemoryRouter>
    </DocumentsContext.Provider>,
  );
}

describe("ResumeRecentZone", () => {
  it("lists recently edited flow sheets and block files, most recent first", async () => {
    renderZone([
      entry({ id: "r3", kind: "flow-sheet", title: "Round 3 Flow", lastEditedAt: 300 }),
      entry({ id: "b1", kind: "block-file", title: "Case Neg Blocks", lastEditedAt: 200 }),
      entry({ id: "r1", kind: "flow-sheet", title: "Round 1 Flow", lastEditedAt: 100 }),
    ]);

    const links = await screen.findAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Round 3 Flow"),
      expect.stringContaining("Case Neg Blocks"),
      expect.stringContaining("Round 1 Flow"),
    ]);
  });

  it("resumes each item in one click: the right editor route with that document", async () => {
    renderZone([
      entry({ id: "abc123", kind: "flow-sheet", title: "Round 3 Flow", lastEditedAt: 300 }),
      entry({ id: "blk", kind: "block-file", title: "Case Neg Blocks", lastEditedAt: 200 }),
    ]);

    const flow = await screen.findByRole("link", { name: /resume round 3 flow/i });
    expect(flow).toHaveAttribute("href", "/rounds/abc123");

    const block = screen.getByRole("link", { name: /resume case neg blocks/i });
    expect(block).toHaveAttribute("href", "/blocks");
  });

  it("resumes a speech doc at its own route with a Speech badge", async () => {
    renderZone([
      entry({ id: "sp42", kind: "speech-doc", title: "1AC", lastEditedAt: 400 }),
    ]);

    const link = await screen.findByRole("link", { name: /resume 1AC/i });
    expect(link).toHaveAttribute("href", "/speeches/sp42");
    expect(within(link).getByText("Speech")).toBeInTheDocument();
  });

  it("shows a sensible empty state, not a broken zone, on an empty registry", async () => {
    renderZone([]);

    // No resume links, but a clear empty message mentioning recent prep.
    expect(screen.queryByRole("link")).toBeNull();
    const region = screen.getByRole("region", { name: /resume/i });
    expect(within(region).getByText(/recent/i)).toBeInTheDocument();
  });
});

describe("ResumeRecentZone one-click resume (routed, real service)", () => {
  it("navigates into the flow sheet editor with the resumed round open", async () => {
    // Seed a round into the shared IndexedDB backend before the app mounts.
    const seed = openDocumentService();
    await seed.whenReady;
    await seed.create({ kind: "flow-sheet", title: "Round 3 Flow" });
    await seed.close();

    render(
      <DocumentsProvider>
        <MemoryRouter initialEntries={["/"]}>
          <AppRoutes />
        </MemoryRouter>
      </DocumentsProvider>,
    );

    const resume = await screen.findByRole("link", { name: /resume round 3 flow/i });
    fireEvent.click(resume);

    // Lands on the round's own flow-sheet editor (heading is the round title).
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: /round 3 flow/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeNull();
  });
});
