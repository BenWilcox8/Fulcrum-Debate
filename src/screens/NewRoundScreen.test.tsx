// NewRoundScreen creates a round through the real document service, so it needs
// the DocumentsProvider (backed by the in-memory IndexedDB fake, per the
// document-layer test pattern).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import NewRoundScreen from "./NewRoundScreen";
import { DocumentsProvider, useDocumentService } from "../documents/react";
import { ROUND_KIND } from "../rounds";
import type { DocumentService } from "../documents/service";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

// A leaf that both proves the redirect landed on a round id and exposes the
// service so the test can assert a flow-sheet document was actually created.
let capturedService: DocumentService | null = null;
function RoundStub() {
  capturedService = useDocumentService();
  return <div data-testid="round-landing">round canvas</div>;
}

function renderNewRound() {
  return render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={["/rounds/new"]}>
        <Routes>
          <Route path="/rounds/new" element={<NewRoundScreen />} />
          <Route path="/rounds/:roundId" element={<RoundStub />} />
          <Route path="/rounds" element={<div>rounds index</div>} />
        </Routes>
      </MemoryRouter>
    </DocumentsProvider>,
  );
}

describe("NewRoundScreen", () => {
  beforeEach(() => {
    capturedService = null;
  });

  it("creates a flow-sheet round document and redirects to its canvas", async () => {
    renderNewRound();

    // Paints synchronously with a transient creating state (no network gate).
    expect(screen.getByRole("heading", { name: /creating round/i })).toBeInTheDocument();

    // Redirects to the freshly created round's canvas.
    await screen.findByTestId("round-landing");

    // The redirect target proves the create primitive ran: exactly one
    // flow-sheet (round) document now exists in the registry.
    await waitFor(async () => {
      const rounds = (await capturedService!.list()).filter(
        (entry) => entry.kind === ROUND_KIND,
      );
      expect(rounds).toHaveLength(1);
    });
  });
});
