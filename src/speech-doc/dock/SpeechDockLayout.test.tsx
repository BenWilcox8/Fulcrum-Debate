// jsdom has no IndexedDB; SpeechDock opens the active doc through the real
// service, so install the fake first. These tests drive the composed docking
// layout: both dock positions render, the position + size preference persists
// across a remount (reload), and the collapse control returns the flow to full
// space.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fireEvent, render, type RenderResult } from "@testing-library/react";

import { DocumentsProvider } from "../../documents/react";
import { ActiveSpeechDocProvider } from "../ActiveSpeechDocProvider";
import { createActiveSpeechDocStore } from "../active-speech-doc";
import { SpeechDockLayout } from "./SpeechDockLayout";
import {
  DOCK_LAYOUT_STORAGE_KEY,
  type DockLayoutStorage,
} from "./dock-layout-storage";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  // Remove any matchMedia stub a test installed so others see jsdom's default.
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

/**
 * Stub `window.matchMedia` (absent in jsdom) to report the viewport as narrow or
 * roomy, so the narrow-aware dock default is testable without a real browser.
 */
function stubMatchMedia(narrow: boolean): void {
  (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (
    query: string,
  ) =>
    ({
      matches: narrow && /max-width/.test(query),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function memoryStorage(seed: Record<string, string> = {}): DockLayoutStorage & {
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function renderLayout(storage: DockLayoutStorage): RenderResult {
  return render(
    <DocumentsProvider>
      <ActiveSpeechDocProvider store={createActiveSpeechDocStore()}>
        <SpeechDockLayout storage={storage}>
          <div data-testid="flow-pane">flow sheet</div>
        </SpeechDockLayout>
      </ActiveSpeechDocProvider>
    </DocumentsProvider>,
  );
}

describe("SpeechDockLayout", () => {
  it("docks the speech pane beside the flow (side by default)", () => {
    const view = renderLayout(memoryStorage());
    expect(view.getByTestId("flow-pane")).toBeTruthy();
    expect(view.getByTestId("speech-dock")).toBeTruthy();
    expect(view.getByTestId("split-dock").getAttribute("data-dock-position")).toBe(
      "side",
    );
  });

  it("renders the bottom position from a persisted preference", () => {
    const storage = memoryStorage({
      [DOCK_LAYOUT_STORAGE_KEY]: JSON.stringify({ position: "bottom", size: 0.4 }),
    });
    const view = renderLayout(storage);
    expect(view.getByTestId("split-dock").getAttribute("data-dock-position")).toBe(
      "bottom",
    );
  });

  it("persists a position switch and reflects it live", () => {
    const storage = memoryStorage();
    const view = renderLayout(storage);
    fireEvent.click(view.getByRole("button", { name: "Bottom" }));

    expect(view.getByTestId("split-dock").getAttribute("data-dock-position")).toBe(
      "bottom",
    );
    expect(JSON.parse(storage.data[DOCK_LAYOUT_STORAGE_KEY]).position).toBe(
      "bottom",
    );
  });

  it("persists a resize and restores it on a remount (reload)", () => {
    const storage = memoryStorage();
    const first = renderLayout(storage);

    const before = Number(
      first.getByRole("separator").getAttribute("aria-valuenow"),
    );
    fireEvent.keyDown(first.getByRole("separator"), { key: "ArrowLeft" });
    const after = Number(
      first.getByRole("separator").getAttribute("aria-valuenow"),
    );
    expect(after).toBeGreaterThan(before);
    expect(storage.data[DOCK_LAYOUT_STORAGE_KEY]).toBeTruthy();

    first.unmount();

    // Remount over the same storage as if after a reload.
    const second = renderLayout(storage);
    expect(
      Number(second.getByRole("separator").getAttribute("aria-valuenow")),
    ).toBe(after);
  });

  it("starts collapsed on a narrow viewport (flow gets full width; dock is one click away)", () => {
    stubMatchMedia(true);
    const view = renderLayout(memoryStorage());

    // No side-by-side split on a narrow screen: the flow fills the space and the
    // dock is opened deliberately via the affordance.
    expect(view.queryByTestId("split-dock")).toBeNull();
    expect(view.queryByTestId("speech-dock")).toBeNull();
    expect(view.getByTestId("flow-pane")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Open speech dock" }));
    expect(view.getByTestId("speech-dock")).toBeTruthy();
  });

  it("stays open by default on a roomy viewport", () => {
    stubMatchMedia(false);
    const view = renderLayout(memoryStorage());
    expect(view.getByTestId("speech-dock")).toBeTruthy();
    expect(view.getByTestId("split-dock")).toBeTruthy();
  });

  it("collapses to full-flow and re-opens (session-only, not persisted)", () => {
    const view = renderLayout(memoryStorage());
    fireEvent.click(view.getByRole("button", { name: "Close speech dock" }));

    // Dock gone, flow still present, an affordance to bring it back.
    expect(view.queryByTestId("speech-dock")).toBeNull();
    expect(view.getByTestId("flow-pane")).toBeTruthy();
    const reopen = view.getByRole("button", { name: "Open speech dock" });

    fireEvent.click(reopen);
    expect(view.getByTestId("speech-dock")).toBeTruthy();
  });
});
