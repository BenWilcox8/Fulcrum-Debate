import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

/**
 * App-boot offline integration test - the highest-seam guarantee of the
 * local-first boot rule (see AGENTS.md "Local-first boot").
 *
 * It mounts the real root component (`App`, not a routed sub-tree) with every
 * network transport - fetch, XHR, WebSocket, EventSource, `navigator.sendBeacon`
 * - replaced by a stub that throws the moment it is touched. If any code on the
 * boot path awaited a network resource, the shell would fail to render and this
 * test would fail. Because it renders fully, we know boot is synchronous and
 * offline.
 *
 * Tauri IPC is local, not network, so it is deliberately NOT stubbed to fail.
 * Instead `@tauri-apps/api/core`'s `invoke` is mocked (there is no webview under
 * jsdom) so that any IPC-backed startup reads added to the boot path by other
 * features still exercise cleanly here.
 */

vi.mock("@tauri-apps/api/core", () => ({
  // Resolve every IPC call so boot-time reads (e.g. window geometry,
  // preferences) don't reject for lack of a webview. Feature reads should
  // tolerate defaults; this returns an inert value for any command.
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

function forbidNetwork() {
  const boom = (name: string) => () => {
    throw new Error(
      `Local-first boot violation: the boot path used the network via ${name}().`,
    );
  };

  for (const name of NETWORK_GLOBALS) {
    savedGlobals.set(name, (globalThis as Record<string, unknown>)[name]);
    // A constructor-style stub covers both `fetch(...)` and `new WebSocket(...)`.
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

describe("app boot is local-first (offline)", () => {
  beforeEach(forbidNetwork);
  afterEach(restoreNetwork);

  it("renders the full shell with all network transports stubbed to fail", () => {
    // The real root component, including its router provider.
    render(<App />);

    // Nav chrome is present... (scope to the primary nav: the dashboard's
    // Library zone also links to Block File/Rounds, so a global link query
    // would match more than one.)
    const primaryNav = screen.getByRole("navigation", { name: /primary/i });
    expect(primaryNav).toBeInTheDocument();
    for (const label of ["Dashboard", "Block File", "Rounds"]) {
      expect(
        within(primaryNav).getByRole("link", { name: new RegExp(label, "i") }),
      ).toBeInTheDocument();
    }

    // ...and the default screen paints, with no loading/connecting gate.
    expect(
      screen.getByRole("heading", { level: 2, name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/connecting|loading|signing in|please wait/i)).toBeNull();
  });
});
