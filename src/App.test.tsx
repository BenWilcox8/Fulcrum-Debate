// The rounds area consumes the document service, so the routed sub-tree tests
// mount it inside the real DocumentsProvider - which needs IndexedDB (jsdom has
// none, so install the in-memory fake, per the document-layer test pattern).
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import AppRoutes from "./AppRoutes";
import { DocumentsProvider } from "./documents/react";

// A fresh IndexedDB backend per test so nothing leaks between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("App shell", () => {
  it("mounts with the navigation chrome and the default Dashboard region", () => {
    render(<App />);

    expect(
      screen.getByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeInTheDocument();
  });

  it("root layout div carries h-screen (not min-h-screen) so the flex height chain is definite", () => {
    // Regression: with min-h-screen the root div has no definite height, so
    // flex-1 descendants never get a real height, and h-full inside the flow
    // canvas resolves to 0. h-screen gives a definite 100vh so the whole
    // chain works without devtools intervention.
    const { container } = render(<App />);
    const rootDiv = container.firstElementChild as HTMLElement;
    expect(rootDiv.className).toMatch(/\bh-screen\b/);
    expect(rootDiv.className).not.toMatch(/\bmin-h-screen\b/);
  });
});

describe("frame navigation", () => {
  function renderAt(initialPath: string) {
    return render(
      <DocumentsProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRoutes />
        </MemoryRouter>
      </DocumentsProvider>,
    );
  }

  it("switches the routed region when nav links are clicked, without a reload", () => {
    renderAt("/");

    // Scope link clicks to the primary nav: the dashboard's Library zone also
    // links to Block File/Rounds, so a global link query would be ambiguous.
    const nav = () => screen.getByRole("navigation", { name: /primary/i });

    // Starts on Dashboard.
    expect(
      screen.getByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeInTheDocument();

    // Click through to Block File.
    fireEvent.click(within(nav()).getByRole("link", { name: /block file/i }));
    expect(
      screen.getByRole("heading", { level: 2, name: /block file/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).not.toBeInTheDocument();

    // And on to Rounds.
    fireEvent.click(within(nav()).getByRole("link", { name: /rounds/i }));
    expect(
      screen.getByRole("heading", { level: 2, name: /rounds/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: /block file/i }),
    ).not.toBeInTheDocument();

    // Back to Dashboard.
    fireEvent.click(within(nav()).getByRole("link", { name: /dashboard/i }));
    expect(
      screen.getByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeInTheDocument();
  });

  it("renders the deep-linked area on first paint", () => {
    renderAt("/rounds");

    expect(
      screen.getByRole("heading", { level: 2, name: /rounds/i }),
    ).toBeInTheDocument();
  });
});
