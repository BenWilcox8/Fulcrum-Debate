// jsdom has no IndexedDB; the document core reads the global, so install the
// in-memory fake first. These tests drive the docked speech pane over the *real*
// document service (no mocks): the active-doc indicator, switching which speech
// is docked, the dock-position toggle, and the collapse control.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  waitFor,
  type RenderResult,
} from "@testing-library/react";

import { DocumentsProvider } from "../../documents/react";
import { ActiveSpeechDocProvider } from "../ActiveSpeechDocProvider";
import {
  createActiveSpeechDocStore,
  type ActiveSpeechDocStore,
} from "../active-speech-doc";
import { useSpeechDocs } from "../speech-doc";
import { SpeechDock } from "./SpeechDock";
import type { DockPosition } from "./dock-layout";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

interface Setup {
  view: RenderResult;
  store: ActiveSpeechDocStore;
  onPositionChange: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
  createSpeechDoc: (title?: string) => Promise<string>;
}

/**
 * Renders the SpeechDock inside a real DocumentsProvider, exposing the
 * speech-doc create seam so a test can seed docs the dock will list reactively.
 */
async function setup(position: DockPosition = "side"): Promise<Setup> {
  const store = createActiveSpeechDocStore();
  const onPositionChange = vi.fn();
  const onClose = vi.fn();
  let create: ((title?: string) => Promise<string>) | null = null;

  function Harness() {
    const { createSpeechDoc } = useSpeechDocs();
    create = createSpeechDoc;
    return (
      <SpeechDock
        position={position}
        onPositionChange={onPositionChange}
        onClose={onClose}
      />
    );
  }

  const view = render(
    <DocumentsProvider>
      <ActiveSpeechDocProvider store={store}>
        <Harness />
      </ActiveSpeechDocProvider>
    </DocumentsProvider>,
  );

  await waitFor(() => expect(create).not.toBeNull());
  return {
    view,
    store,
    onPositionChange,
    onClose,
    createSpeechDoc: (title?: string) => create!(title),
  };
}

describe("SpeechDock", () => {
  it("shows 'No active speech' when none is active", async () => {
    const { view } = await setup();
    expect(
      view.getByTestId("active-speech-doc-indicator").textContent,
    ).toContain("No active speech");
  });

  it("clearly indicates the active speech doc by title", async () => {
    const { view, store, createSpeechDoc } = await setup();
    let id = "";
    await act(async () => {
      id = await createSpeechDoc("1AC - Framework");
    });
    act(() => store.setActiveId(id));

    await waitFor(() => {
      const indicator = view.getByTestId("active-speech-doc-indicator");
      expect(indicator.textContent).toContain("Active speech:");
      expect(indicator.textContent).toContain("1AC - Framework");
    });
  });

  it("switches the active speech doc from the dock's selector", async () => {
    const { view, store, createSpeechDoc } = await setup();
    let firstId = "";
    let secondId = "";
    await act(async () => {
      firstId = await createSpeechDoc("Aff Case");
      secondId = await createSpeechDoc("Neg Block");
    });
    act(() => store.setActiveId(firstId));

    const select = view.getByLabelText("Active speech doc") as HTMLSelectElement;
    await waitFor(() => expect(select.value).toBe(firstId));

    fireEvent.change(select, { target: { value: secondId } });
    expect(store.getActiveId()).toBe(secondId);
    await waitFor(() =>
      expect(
        view.getByTestId("active-speech-doc-indicator").textContent,
      ).toContain("Neg Block"),
    );
  });

  it("marks the current dock position on the toggle and switches it", async () => {
    const { view, onPositionChange } = await setup("side");
    const sideButton = view.getByRole("button", { name: "Side" });
    const bottomButton = view.getByRole("button", { name: "Bottom" });
    expect(sideButton.getAttribute("aria-pressed")).toBe("true");
    expect(bottomButton.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(bottomButton);
    expect(onPositionChange).toHaveBeenCalledWith("bottom");
  });

  it("collapses via the close control", async () => {
    const { view, onClose } = await setup();
    fireEvent.click(view.getByRole("button", { name: "Close speech dock" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mounts the editor for the active speech doc", async () => {
    const { view, store, createSpeechDoc } = await setup();
    let id = "";
    await act(async () => {
      id = await createSpeechDoc("Speech");
    });
    act(() => store.setActiveId(id));
    await waitFor(() => {
      expect(view.getByTestId("speech-doc-editor")).toBeTruthy();
    });
  });
});
