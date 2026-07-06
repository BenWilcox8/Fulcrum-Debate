/**
 * Whole-stack end-to-end proof for the Card-Cutting Toolbar & Tool Customization
 * Framework (the closeout of its four slices).
 *
 * The earlier slices unit-tested each piece in isolation: the registration
 * contract + shared-store wiring (`registry.test.ts`), the toolbar container
 * (`react/CardToolbar.test.tsx`), the hook that registers the shipped tools
 * (`react/useCardTools.test.tsx`), and the schema-generated per-tool Settings
 * bridge (`../settings/tools/toolSettingsContributions.test.tsx`). This test
 * closes the loop by composing them the way the real app does, top to bottom,
 * with *no mocks*: a demo tool is registered on a genuinely *persistent* shared
 * store (`openPreferenceStore`, the same y-indexeddb backend the document
 * registry uses), rendered through the real `CardToolbar`, and its settings are
 * surfaced through the real `toolSettingsContributions` seam on the real
 * `SettingsScreen` - all pointing at the one namespaced section.
 *
 * It proves the framework's reason to exist, end to end:
 *
 *   1. A registered tool appears in the toolbar (its label, enabled once a card
 *      is addressable at the selection).
 *   2. Clicking it applies the tool to the live editor selection, using the
 *      tool's live settings snapshot (the default marker).
 *   3. The same tool's declared settings appear in the Settings screen, generated
 *      from its schema (no bespoke panel).
 *   4. Changing a setting through the Settings UI is observed live by the running
 *      tool - the next apply uses the new value - because the toolbar's registry
 *      and the Settings contribution point at one store section.
 *   5. That change persists: a fresh store over the same backend rehydrates the
 *      override, and a freshly registered tool reads it (the "customization"
 *      half of the framework survives a restart).
 *
 * The editor is the exact block-file + card preset the Block File screen ships.
 * A fresh IndexedDB backend per test isolates them; reopening a store within a
 * test hits the same backend on purpose - that shared backend *is* the
 * persistence under test. Follows the `settings.e2e` / `card.e2e` closeout
 * precedent.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { Editor } from "@tiptap/core";

import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  cardCreate,
  buildCardContent,
  getSideRegion,
  getSelectedCard,
} from "../blockfile";
import {
  PreferenceStoreProvider,
  openPreferenceStore,
  type PersistentPreferenceStore,
  type PreferenceField,
} from "../preferences";
import { SettingsProvider } from "../settings/SettingsProvider";
import SettingsScreen from "../settings/SettingsScreen";
import { toolSettingsContributions } from "../settings/tools/toolSettingsContributions";
import {
  createCardToolRegistry,
  toolSectionId,
  type CardToolDefinition,
} from "./registry";
import { CardToolbar } from "./react/CardToolbar";

/**
 * The demo card tool the whole seam is exercised through: a reference tool with
 * one text setting whose value it stamps into the card at the selection, so a
 * Settings change is *observable* in the document the next time the tool runs.
 * Requiring a selected card mirrors a real card-cutting tool (the toolbar
 * enables it only when `getSelectedCard` resolves), and returning the chain's
 * truthiness matches the contract.
 */
const DEMO_TOOL: CardToolDefinition<{ marker: PreferenceField<string> }> = {
  id: "stamp",
  label: "Stamp card",
  description: "Reference tool: stamps a configurable marker at the selection.",
  settings: {
    // Widened to `string` (the store-core convention) so it can be set to another value.
    marker: { default: "AFF:", label: "Marker text" as string },
  },
  applyToSelection(editor, settings) {
    if (!getSelectedCard(editor)) return false;
    return editor.chain().focus().insertContent(settings.marker).run();
  },
};

let services: DocumentService[] = [];
let editors: Editor[] = [];
let stores: PersistentPreferenceStore[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  cleanup();
  for (const editor of editors) editor.destroy();
  for (const service of services) await service.close();
  for (const store of stores) await store.close();
  editors = [];
  services = [];
  stores = [];
});

/**
 * Build a block-file editor with the *exact* preset the Block File screen ships
 * (side schema + card node model + quick-create binding) over a fresh block-file
 * document, insert a card into the aff side, and place the caret inside it so a
 * card is addressable at the selection (the toolbar's enable condition). Returns
 * the editor.
 */
async function openEditorWithSelectedCard(service: DocumentService): Promise<Editor> {
  const handle: DocumentHandle = await service.create({
    kind: "block-file",
    title: "tools-e2e",
  });
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions, cardCreate],
    }),
  });
  editors.push(editor);

  // Insert a card after the aff side's leading paragraph and drop the caret in
  // its tag region, so `getSelectedCard` resolves and the toolbar enables.
  const at = getSideRegion(editor, "aff").contentEnd;
  editor
    .chain()
    .insertContentAt(at, buildCardContent({ tag: "T" }), { updateSelection: false })
    .run();
  editor.commands.setTextSelection(at + 2);
  return editor;
}

describe("card-cutting toolbar & tool customization framework end-to-end", () => {
  it("registers a demo tool, renders it in the toolbar, applies it to the selection, surfaces its settings, and observes a Settings change live and across a restart", async () => {
    // --- Author phase: one persistent store shared by toolbar + Settings -----
    const service = openDocumentService();
    services.push(service);
    const editor = await openEditorWithSelectedCard(service);

    const store = openPreferenceStore();
    stores.push(store);
    await store.whenLoaded;

    // The toolbar's registry and the Settings contribution both point at this
    // one store, so the running tool and its Settings UI share a section.
    const registry = createCardToolRegistry(store);
    const tool = registry.register(DEMO_TOOL);
    expect(tool.settings.id).toBe(toolSectionId("stamp"));

    render(
      <PreferenceStoreProvider store={store}>
        <SettingsProvider contributions={toolSettingsContributions([DEMO_TOOL])}>
          <SettingsScreen />
        </SettingsProvider>
        <CardToolbar editor={editor} tools={registry.list()} />
      </PreferenceStoreProvider>,
    );

    // 1) The registered tool appears in the toolbar, enabled (a card is selected).
    const toolbar = screen.getByRole("toolbar", { name: /card tools/i });
    const stampButton = within(toolbar).getByRole("button", { name: "Stamp card" });
    expect(stampButton).toBeEnabled();

    // 3) Its declared settings appear in the Settings screen, generated from the
    //    schema: the tool is a navigable section (by its label) with its marker
    //    control at the declared default.
    const nav = screen.getByRole("navigation", { name: /settings sections/i });
    expect(within(nav).getByText("Stamp card")).toBeInTheDocument();
    const markerInput = screen.getByLabelText(/marker text/i);
    expect(markerInput).toHaveValue("AFF:");

    // 2) Clicking the toolbar button applies the tool to the live selection with
    //    its default setting.
    fireEvent.click(stampButton);
    expect(editor.getText()).toContain("AFF:");

    // 4) Change the marker through the Settings UI and the running tool observes
    //    it live: the next apply stamps the new value (not the default).
    fireEvent.change(markerInput, { target: { value: "NEG:" } });
    expect(markerInput).toHaveValue("NEG:");

    // The caret is still inside the card (the first apply left it in the tag),
    // so the toolbar stays enabled; the next apply stamps the new value.
    expect(stampButton).toBeEnabled();
    fireEvent.click(stampButton);
    expect(editor.getText()).toContain("NEG:");

    // Let the local write settle, then tear the author instances down (an app exit).
    await store.close();
    stores = stores.filter((s) => s !== store);
    cleanup();

    // --- Restart phase: a fresh store over the same backend ------------------
    // The customization survives: a freshly registered tool reads the persisted
    // marker, so its very first apply stamps "NEG:" without any UI interaction.
    const service2 = openDocumentService();
    services.push(service2);
    const editor2 = await openEditorWithSelectedCard(service2);

    const store2 = openPreferenceStore();
    stores.push(store2);
    await store2.whenLoaded;

    const registry2 = createCardToolRegistry(store2);
    const tool2 = registry2.register(DEMO_TOOL);
    await waitFor(() => expect(tool2.settings.get("marker")).toBe("NEG:"));

    render(
      <PreferenceStoreProvider store={store2}>
        <CardToolbar editor={editor2} tools={registry2.list()} />
      </PreferenceStoreProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Stamp card" }));
    expect(editor2.getText()).toContain("NEG:");
    expect(editor2.getText()).not.toContain("AFF:");
  });
});
