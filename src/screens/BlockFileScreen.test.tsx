/**
 * Screen-level tests for the Block File screen's quick card-creation affordance:
 * a visible, keyboard-reachable *New card* button that drops a structured card
 * skeleton into the editor.
 *
 * Drives the real routed screen over the real DocumentService (no mocks), the same
 * `fake-indexeddb` harness the workspace tests use. Assertions are behavioral
 * (rendered card structure), never pixels - contentEditable is inert under jsdom.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRoutes from "../AppRoutes";
import { DocumentsProvider } from "../documents/react";
import {
  createPreferenceStore,
  PreferenceStoreProvider,
  type PreferenceStore,
} from "../preferences";
import {
  DEFAULT_FORMATTING_PROFILE,
  registerFormattingSection,
} from "../formatting";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Renders the routed shell at `path` inside a fresh document provider. */
function renderShellAt(path: string, store?: PreferenceStore) {
  return render(
    <PreferenceStoreProvider store={store}>
      <DocumentsProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </DocumentsProvider>
    </PreferenceStoreProvider>,
  );
}

describe("Block File screen - quick card creation", () => {
  it("offers a New card button once the editor is ready", async () => {
    renderShellAt("/blocks");

    // A real <button> - inherently keyboard-reachable (Tab + Enter).
    const button = await screen.findByRole("button", { name: /new card/i });
    expect(button).toBeInTheDocument();
  });

  it("inserts a structured card into the editor when clicked", async () => {
    const { container } = renderShellAt("/blocks");

    // Wait for the editor to mount before acting.
    await waitFor(() => {
      expect(
        container.querySelector('[contenteditable="true"].ProseMirror'),
      ).not.toBeNull();
    });

    expect(container.querySelector("[data-card]")).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: /new card/i }));

    // A full card skeleton - all four regions - is now rendered in the document.
    await waitFor(() => {
      expect(container.querySelector("[data-card]")).not.toBeNull();
    });
    const card = container.querySelector("[data-card]")!;
    expect(card.querySelector('[data-card-region="tag"]')).not.toBeNull();
    expect(card.querySelector('[data-card-region="tagline"]')).not.toBeNull();
    expect(card.querySelector('[data-card-region="cite"]')).not.toBeNull();
    expect(card.querySelector('[data-card-region="body"]')).not.toBeNull();
  });
});

describe("Block File screen - live evidence formatting", () => {
  it("renders the active formatting profile as scoped card CSS", async () => {
    const { container } = renderShellAt("/blocks");

    await waitFor(() => {
      expect(
        container.querySelector('[contenteditable="true"].ProseMirror'),
      ).not.toBeNull();
    });

    const style = container.querySelector("style[data-card-formatting]");
    expect(style).not.toBeNull();
    const css = style!.textContent ?? "";
    // Scoped to the block-file editor surface and encoding the standard.
    expect(css).toContain('.block-file-editor [data-card-region="tag"]');
    expect(css).toContain("font-size: 13pt"); // tag
    expect(css).toContain("font-weight: bold"); // tag bold
    expect(css).toContain("text-decoration: underline"); // highlight
  });

  it("updates card rendering live when the profile is edited (no reload)", async () => {
    const store = createPreferenceStore();
    const handle = registerFormattingSection(store);
    const { container } = renderShellAt("/blocks", store);

    await waitFor(() => {
      expect(
        container.querySelector('[contenteditable="true"].ProseMirror'),
      ).not.toBeNull();
    });

    const css = () =>
      container.querySelector("style[data-card-formatting]")!.textContent ?? "";
    expect(css()).toContain("font-size: 12pt"); // body default

    // Edit the body target through the same store a Settings panel would use.
    act(() => {
      handle.set("body", {
        ...DEFAULT_FORMATTING_PROFILE.body,
        fontSize: "22pt",
      });
    });

    // The emitted CSS updates in place, without remounting the editor.
    expect(css()).toContain("font-size: 22pt");
  });
});
