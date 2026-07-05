// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern the document / flow layers use. These tests
// drive the round lifecycle end to end through the *real* DocumentService (no
// mocks): the shell screens, the round seam, and the flow-sheet model.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRoutes from "../AppRoutes";
import { DocumentsProvider, useDocumentService } from "../documents/react";
import type { DocumentService } from "../documents/service";
import { addColumn } from "../flow";
import { ROUND_KIND, useRounds } from "./rounds";

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

/**
 * A headless harness exposing the live service and the round seam, so a test can
 * create rounds and seed their flow sheets directly (mirroring how the screens
 * drive the same seam), then remount a fresh provider to prove reload.
 */
interface Harness {
  service: DocumentService;
  createRound: (title?: string) => Promise<string>;
}

let harness: Harness | null = null;

function CaptureHarness() {
  const service = useDocumentService();
  const { createRound } = useRounds();
  harness = { service, createRound };
  return null;
}

async function withHarness(run: (h: Harness) => Promise<void>) {
  harness = null;
  const view = render(
    <DocumentsProvider>
      <CaptureHarness />
    </DocumentsProvider>,
  );
  await waitFor(() => expect(harness).not.toBeNull());
  await run(harness!);
  view.unmount();
  await waitFor(() => expect(harness!.service.closed).toBe(true));
}

/** Opens a round's flow sheet and appends one column, awaiting the local load. */
async function seedColumn(
  service: DocumentService,
  roundId: string,
  side: "aff" | "neg",
  label: string,
) {
  const handle = await service.open(roundId);
  await handle.whenLoaded;
  addColumn(handle, { side, label });
}

describe("round lifecycle integration", () => {
  it("starts a new round on a fresh, empty flow canvas backed by a new document", async () => {
    renderShellAt("/rounds");

    // The rounds index starts empty.
    expect(
      await screen.findByRole("heading", { level: 2, name: /^rounds$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no rounds yet/i)).toBeInTheDocument();

    // Starting a round navigates to its own flow canvas...
    fireEvent.click(screen.getByRole("button", { name: /new round/i }));

    // ...which mounts the flow-sheet controls with no columns yet.
    expect(await screen.findByTestId("column-controls")).toBeInTheDocument();
    expect(screen.queryAllByTestId("column-row")).toHaveLength(0);
    expect(
      await screen.findByRole("heading", { level: 2, name: /round 1/i }),
    ).toBeInTheDocument();
  });

  it("reopens an existing round and restores exactly that round's columns", async () => {
    let roundId = "";

    // Create a round and seed a column, all against one service instance...
    await withHarness(async ({ service, createRound }) => {
      await act(async () => {
        roundId = await createRound("Seeded round");
      });
      await act(async () => {
        await seedColumn(service, roundId, "aff", "1AC");
      });
    });

    // ...then reopen it through a completely fresh provider (simulated restart)
    // over the same IndexedDB backend: the round's column is restored.
    renderShellAt(`/rounds/${roundId}`);

    expect(await screen.findByDisplayValue("1AC")).toBeInTheDocument();
  });

  it("isolates two rounds - one round's edits never appear in the other", async () => {
    let affRoundId = "";
    let negRoundId = "";

    await withHarness(async ({ service, createRound }) => {
      await act(async () => {
        affRoundId = await createRound("Aff round");
      });
      await act(async () => {
        negRoundId = await createRound("Neg round");
      });
      await act(async () => {
        await seedColumn(service, affRoundId, "aff", "AFF-ONLY");
        await seedColumn(service, negRoundId, "neg", "NEG-ONLY");
      });
    });

    // The aff round shows only its own column.
    const affView = renderShellAt(`/rounds/${affRoundId}`);
    expect(await screen.findByDisplayValue("AFF-ONLY")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("NEG-ONLY")).toBeNull();
    affView.unmount();

    // The neg round shows only its own column.
    renderShellAt(`/rounds/${negRoundId}`);
    expect(await screen.findByDisplayValue("NEG-ONLY")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("AFF-ONLY")).toBeNull();
  });

  it("shows a not-found state when navigating to an unrecognised round id", async () => {
    renderShellAt("/rounds/does-not-exist");

    expect(await screen.findByText(/round not found/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to all rounds/i }),
    ).toBeInTheDocument();
  });

  it("lists created rounds as flow-sheet documents on the rounds index", async () => {
    await withHarness(async ({ createRound }) => {
      await act(async () => {
        await createRound("Listed round");
      });
    });

    renderShellAt("/rounds");

    expect(
      await screen.findByRole("link", { name: /listed round/i }),
    ).toBeInTheDocument();
  });
});

describe("round-to-document mapping", () => {
  it("maps a round to a flow-sheet document kind", () => {
    expect(ROUND_KIND).toBe("flow-sheet");
  });
});
