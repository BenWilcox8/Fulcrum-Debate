/**
 * Whole-stack end-to-end proof for the Settings Shell & Preferences Store
 * feature (the closeout of its five slices).
 *
 * The earlier slices unit-tested each piece in isolation: the pure store core
 * (`store.test.ts`), its React bindings (`react.test.tsx`), local persistence
 * over y-indexeddb (`persistence.test.ts`), and the Settings shell driven by an
 * in-memory store (`settings.test.tsx`). This test closes the loop by composing
 * them the way the real app does, top to bottom, with *no mocks*: a feature
 * contributes a section through the real `SettingsProvider` seam, the section is
 * registered on a genuinely *persistent* store (`openPreferenceStore`, the same
 * y-indexeddb backend the document registry uses), the user changes a value
 * through the real `SettingsScreen` UI, and a separate consumer component reads
 * that value live.
 *
 * It proves the four behaviours the feature exists for, end to end:
 *
 *   1. Change a setting through the Settings screen -> a consuming component
 *      elsewhere in the tree updates live, with no reload (the shared store's
 *      subscription seam, ridden by `useSection` in two places at once).
 *   2. The change is written to local IndexedDB.
 *   3. Reopen a *fresh* store over the same backend (an app restart) -> the
 *      override rehydrates and the consumer paints the persisted value.
 *   4. Reset to defaults from the Settings screen restores the default live, and
 *      that reset persists too (the override is forgotten in storage).
 *
 * A fresh IndexedDB backend per test isolates them; reopening a store within a
 * test hits the same backend on purpose - that shared backend *is* the
 * persistence under test.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  PreferenceStoreProvider,
  openPreferenceStore,
  usePreferenceStore,
  useSection,
  type PersistentPreferenceStore,
  type SectionHandle,
} from "../preferences";
import SettingsScreen from "./SettingsScreen";
import { SettingsProvider } from "./SettingsProvider";
import {
  defineSettingsContribution,
  type SettingsContribution,
  type SettingsPanelProps,
} from "./types";

// A fresh IndexedDB backend per test so nothing leaks across tests; every store
// opened in a test shares this one backend, which is the persistence under test.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const FORMATTING_ID = "formatting";
const FONT_SIZES = ["10pt", "11pt", "12pt"] as const;

/**
 * A representative feature section. `as const` is omitted so the string default
 * widens to `string`, letting the panel `set` another option (the store-core
 * convention).
 */
const formattingFields = {
  fontSize: {
    default: "11pt",
    label: "Font size",
    options: [...FONT_SIZES],
  },
};

/** The formatting panel: one button per font-size option, live-checked. */
function FormattingPanel({ handle }: SettingsPanelProps<typeof formattingFields>) {
  const { fontSize } = useSection(handle);
  return (
    <div>
      {FONT_SIZES.map((size) => (
        <button
          key={size}
          type="button"
          aria-pressed={fontSize === size}
          onClick={() => handle.set("fontSize", size)}
        >
          {size}
        </button>
      ))}
    </div>
  );
}

const formattingContribution: SettingsContribution = defineSettingsContribution({
  definition: {
    id: FORMATTING_ID,
    title: "Formatting",
    description: "Controls the editor's type size.",
    fields: formattingFields,
  },
  panel: FormattingPanel,
});

/**
 * A stand-in for a feature surface elsewhere in the app that *consumes* the
 * formatting preference (e.g. a live editor preview). It reads the same section
 * handle the panel writes, so it re-renders through the shared store's
 * subscription - proving the setting drives more than its own panel.
 */
function LivePreview() {
  const store = usePreferenceStore();
  const handle = store.getSection(
    FORMATTING_ID,
  ) as SectionHandle<typeof formattingFields>;
  const { fontSize } = useSection(handle);
  return <p data-testid="preview">Rendering at {fontSize}</p>;
}

/**
 * Mounts the production wiring over a given persistent store: the shared-store
 * provider, the real contribution seam registering the formatting section, the
 * real Settings screen, and a consumer of the same section.
 */
function renderApp(store: PersistentPreferenceStore) {
  return render(
    <PreferenceStoreProvider store={store}>
      <SettingsProvider contributions={[formattingContribution]}>
        <SettingsScreen />
        <LivePreview />
      </SettingsProvider>
    </PreferenceStoreProvider>,
  );
}

describe("Settings shell + preferences store end-to-end", () => {
  it("changes a setting via the UI, updates a consumer live, persists across reload, and resets", async () => {
    // 1. Boot a persistent store and render the Settings screen + a live
    //    consumer. Both start at the registered default.
    const first = openPreferenceStore();
    await first.whenLoaded;
    renderApp(first);

    expect(screen.getByTestId("preview")).toHaveTextContent("11pt");
    expect(screen.getByRole("button", { name: "11pt" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 2. Change the value through the Settings screen UI...
    fireEvent.click(screen.getByRole("button", { name: "12pt" }));

    // ...and the consumer elsewhere in the tree updates live, no reload.
    expect(screen.getByTestId("preview")).toHaveTextContent("12pt");

    // Let the local write settle, then tear the app down (close = app exit).
    await first.close();
    cleanup();

    // 3. Reopen a fresh store over the *same* backend (an app restart): the
    //    persisted override rehydrates and the consumer paints it after load.
    const second = openPreferenceStore();
    renderApp(second);
    await waitFor(() =>
      expect(screen.getByTestId("preview")).toHaveTextContent("12pt"),
    );
    // The panel reflects the persisted choice too.
    expect(screen.getByRole("button", { name: "12pt" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // 4. Reset to defaults from the Settings screen restores the default live.
    fireEvent.click(screen.getByRole("button", { name: /reset.*default/i }));
    expect(screen.getByTestId("preview")).toHaveTextContent("11pt");

    // The reset persists too: reopen once more and the default comes back from
    // storage (the override was forgotten, not re-stored).
    await second.close();
    cleanup();

    const third = openPreferenceStore();
    renderApp(third);
    await waitFor(() =>
      expect(screen.getByTestId("preview")).toHaveTextContent("11pt"),
    );

    await third.close();
  });
});
