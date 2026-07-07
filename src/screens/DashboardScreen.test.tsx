// The Library zone links onto the Rounds/Block File areas, which consume the
// document service, so navigation tests mount the routed sub-tree inside the
// real DocumentsProvider - which needs IndexedDB (jsdom has none, so install the
// in-memory fake, per the document-layer test pattern).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRoutes from "../AppRoutes";
import { DocumentsProvider } from "../documents/react";

// A fresh IndexedDB backend per test so nothing leaks between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

function renderDashboard() {
  return render(
    <DocumentsProvider>
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>
    </DocumentsProvider>,
  );
}

describe("DashboardScreen three-zone shell", () => {
  it("is the default landing screen and paints synchronously with no connecting gate", () => {
    renderDashboard();

    // Landing on "/" renders the dashboard, not a loading/connecting screen.
    expect(
      screen.getByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/connecting|loading|signing in|please wait/i),
    ).toBeNull();
  });

  it("renders all three zones as labelled regions", () => {
    renderDashboard();

    expect(
      screen.getByRole("region", { name: /resume/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /start something new/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /library/i }),
    ).toBeInTheDocument();
  });

  it("orders the zones with Resume/Recent most prominent (first in reading order)", () => {
    renderDashboard();

    const resume = screen.getByRole("region", { name: /resume/i });
    const startNew = screen.getByRole("region", { name: /start something new/i });
    const library = screen.getByRole("region", { name: /library/i });

    // Resume precedes Start, which precedes Library, in document order.
    expect(
      resume.compareDocumentPosition(startNew) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      startNew.compareDocumentPosition(library) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("exposes a placeholder recent slot and live new-item actions", () => {
    renderDashboard();

    // The recent list is a sibling issue's job: a clearly-marked empty slot.
    const resume = screen.getByRole("region", { name: /resume/i });
    expect(within(resume).getByText(/recent/i)).toBeInTheDocument();

    // The create actions are wired and enabled (no dead placeholder buttons).
    const startNew = screen.getByRole("region", { name: /start something new/i });
    expect(
      within(startNew).getByRole("button", { name: /new round/i }),
    ).toBeEnabled();
    expect(
      within(startNew).getByRole("button", { name: /new card/i }),
    ).toBeEnabled();
    expect(
      within(startNew).getByRole("button", { name: /open block file/i }),
    ).toBeEnabled();
  });

  it("wires New round to create a round and open its flow sheet", async () => {
    renderDashboard();

    const startNew = screen.getByRole("region", { name: /start something new/i });
    fireEvent.click(within(startNew).getByRole("button", { name: /new round/i }));

    // Landing on the round screen (its own heading) proves a flow-sheet document
    // was created through the document service and navigated to.
    expect(
      await screen.findByRole("heading", { level: 2, name: /round 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it("wires Open block file to open the block-file editor", async () => {
    renderDashboard();

    const startNew = screen.getByRole("region", { name: /start something new/i });
    fireEvent.click(
      within(startNew).getByRole("button", { name: /open block file/i }),
    );

    expect(
      await screen.findByRole("heading", { level: 2, name: /block file/i }),
    ).toBeInTheDocument();
  });

  it("wires New card to the block file (its interim home)", async () => {
    renderDashboard();

    const startNew = screen.getByRole("region", { name: /start something new/i });
    fireEvent.click(within(startNew).getByRole("button", { name: /new card/i }));

    expect(
      await screen.findByRole("heading", { level: 2, name: /block file/i }),
    ).toBeInTheDocument();
  });

  it("navigates from the Library zone to the Block File screen", () => {
    renderDashboard();

    const library = screen.getByRole("region", { name: /library/i });
    fireEvent.click(within(library).getByRole("link", { name: /block file/i }));

    expect(
      screen.getByRole("heading", { level: 2, name: /block file/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it("navigates from the Library zone to the Rounds screen", () => {
    renderDashboard();

    const library = screen.getByRole("region", { name: /library/i });
    fireEvent.click(within(library).getByRole("link", { name: /rounds/i }));

    expect(
      screen.getByRole("heading", { level: 2, name: /rounds/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).not.toBeInTheDocument();
  });

  it("navigates from the Library zone to the Speeches screen", () => {
    renderDashboard();

    const library = screen.getByRole("region", { name: /library/i });
    fireEvent.click(within(library).getByRole("link", { name: /speeches/i }));

    expect(
      screen.getByRole("heading", { level: 2, name: /speeches/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).not.toBeInTheDocument();
  });
});
