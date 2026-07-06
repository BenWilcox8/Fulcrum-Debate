/**
 * Whole-stack end-to-end proof for the Launch Dashboard feature (the closeout of
 * its five slices).
 *
 * The earlier slices unit-tested each piece in isolation: the pure
 * `recentDocuments` query seam (`query.test.ts`), the three-zone shell
 * (`DashboardScreen.test.tsx`), the Resume/Recent zone over a stub service
 * (`ResumeRecentZone.test.tsx`), and the wired create actions
 * (`StartSomethingNewZone.test.tsx` / `NewRoundScreen.test.tsx`). This test
 * closes the loop by exercising the dashboard the way the real app composes it,
 * top to bottom, with *no product mocks*: the real root `App` (its HashRouter,
 * preference/settings providers, and every route) mounted inside the real
 * `DocumentsProvider` from `main.tsx`, reading a genuinely persisted registry.
 *
 * Critically, it runs with **every network transport stubbed to throw** (the same
 * guard as `App.offline-boot.test.tsx`), so it doubles as an offline guarantee:
 * the dashboard is the default landing route and boot-path code, and this proves
 * it renders fully - all three zones, the recent list, and working actions -
 * without ever touching the network. Tauri IPC is local (not network) and so is
 * mocked to resolve rather than stubbed to fail.
 *
 * It proves the behaviours the feature exists for, end to end:
 *
 *   1. With network forbidden and a seeded registry, all three zones render
 *      fully - no spinner, no connecting/loading gate.
 *   2. The Resume/Recent zone lists resumable documents in last-edited-descending
 *      order (riding the registry's order, never re-sorting).
 *   3. A one-click resume navigates into the right editor with that document open.
 *   4. A create action (New round) runs the real create-and-redirect primitive
 *      and lands in the fresh round's flow-sheet editor.
 *
 * The seed is written through a throwaway service and flushed to IndexedDB, then
 * read back through the app's real provider - so the dashboard is proven to
 * project a genuinely persisted registry, not in-memory state.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import App from "../../App";
import { DocumentsProvider } from "../../documents/react";
import { openDocumentService } from "../../documents/service";

// Tauri IPC is local, not network, so it is deliberately NOT stubbed to fail;
// there is no webview under jsdom, so resolve every IPC call to an inert value
// (mirrors App.offline-boot.test.tsx).
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

const NETWORK_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
] as const;

type NetworkGlobal = (typeof NETWORK_GLOBALS)[number];

const savedGlobals = new Map<NetworkGlobal, unknown>();
let savedSendBeacon: typeof navigator.sendBeacon | undefined;

/** Replace every network transport with a stub that throws the moment it is used. */
function forbidNetwork() {
  const boom = (name: string) => () => {
    throw new Error(
      `Local-first violation: the dashboard used the network via ${name}().`,
    );
  };

  for (const name of NETWORK_GLOBALS) {
    savedGlobals.set(name, (globalThis as Record<string, unknown>)[name]);
    (globalThis as Record<string, unknown>)[name] = boom(name);
  }

  savedSendBeacon = navigator.sendBeacon?.bind(navigator);
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: boom("navigator.sendBeacon"),
  });
}

function restoreNetwork() {
  for (const name of NETWORK_GLOBALS) {
    (globalThis as Record<string, unknown>)[name] = savedGlobals.get(name);
  }
  savedGlobals.clear();
  if (savedSendBeacon) {
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: savedSendBeacon,
    });
    savedSendBeacon = undefined;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Seeds the registry with a mix of resumable kinds through a throwaway service
 * (the real `create` seam), then closes it - flushing to the shared IndexedDB
 * backend so the app's provider reads them back as a genuinely persisted
 * registry. Creates run oldest-first with a real gap between each so
 * `lastEditedAt` is strictly increasing, giving a deterministic recency order:
 * Round 3 Flow (newest) > Case Neg Blocks > Round 1 Flow (oldest).
 */
async function seedRegistry(): Promise<void> {
  const service = openDocumentService();
  await service.whenReady;

  await service.create({ kind: "flow-sheet", title: "Round 1 Flow" });
  await sleep(2);
  await service.create({ kind: "block-file", title: "Case Neg Blocks" });
  await sleep(2);
  await service.create({ kind: "flow-sheet", title: "Round 3 Flow" });

  await service.close();
}

/** The production composition from `main.tsx`: the real provider wrapping `App`. */
function renderApp() {
  return render(
    <DocumentsProvider>
      <App />
    </DocumentsProvider>,
  );
}

// A fresh IndexedDB backend per test so nothing leaks; the seed service and the
// app's provider share this one backend - that shared backend *is* the
// persistence under test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  // App uses a HashRouter, which reads window.location.hash; reset it so a route
  // navigated to by a prior test never leaks in as the starting route here.
  window.location.hash = "#/";
  forbidNetwork();
});

afterEach(() => {
  restoreNetwork();
  cleanup();
});

describe("Launch dashboard end-to-end (offline)", () => {
  it("renders all three zones offline, orders recents, and resumes into the right editor", async () => {
    await seedRegistry();
    renderApp();

    // 1. All three zones render as labelled regions, with no connecting/loading
    //    gate - proven while every network transport is stubbed to throw.
    expect(
      screen.getByRole("region", { name: /resume/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /start something new/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /library/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/connecting|loading|signing in|please wait/i),
    ).toBeNull();

    // 2. The Resume/Recent zone lists the resumable documents most-recent-first,
    //    riding the registry's last-edited-descending order (never re-sorted).
    const resume = screen.getByRole("region", { name: /resume/i });
    await waitFor(() =>
      expect(
        within(resume).getByRole("link", { name: /resume round 3 flow/i }),
      ).toBeInTheDocument(),
    );

    const resumeLinks = within(resume).getAllByRole("link");
    expect(resumeLinks.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Round 3 Flow"),
      expect.stringContaining("Case Neg Blocks"),
      expect.stringContaining("Round 1 Flow"),
    ]);

    // The routing map holds: flow sheets resume into their round editor, the
    // block file into the singleton workspace.
    expect(
      within(resume).getByRole("link", { name: /resume case neg blocks/i }),
    ).toHaveAttribute("href", expect.stringContaining("/blocks"));

    // 3. One-click resume lands in the flow-sheet editor with that round open
    //    (its heading is the round title). Dashboard is gone.
    fireEvent.click(
      within(resume).getByRole("link", { name: /resume round 3 flow/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: /round 3 flow/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeNull();
  });

  it("runs the New round create action end to end into a fresh flow sheet", async () => {
    // No seed: an empty registry still paints (empty state, not a broken zone),
    // and the create action must work from a cold start.
    renderApp();

    const startNew = screen.getByRole("region", {
      name: /start something new/i,
    });
    fireEvent.click(
      within(startNew).getByRole("button", { name: /new round/i }),
    );

    // The create-and-redirect seam (NewRoundScreen) creates a flow-sheet document
    // through the real service and lands on its editor - the first round is "Round 1".
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 2, name: /round 1/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeNull();
  });
});
