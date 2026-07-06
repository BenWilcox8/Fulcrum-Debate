import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import {
  PreferenceStoreProvider,
  createPreferenceStore,
  useSection,
  type PreferenceStore,
} from "../preferences";
import SettingsScreen from "./SettingsScreen";
import { SettingsProvider } from "./SettingsProvider";
import {
  defineSettingsContribution,
  type SettingsContribution,
  type SettingsPanelProps,
} from "./types";

/**
 * Two representative feature sections. Defaults are written without `as const`
 * so primitive types widen, matching the store-core test pattern; a boolean we
 * need to flip is widened with `as boolean`.
 */
const alphaFields = {
  greeting: { default: "hi", label: "Greeting" },
  loud: { default: false as boolean, label: "Loud" },
};

const betaFields = {
  size: { default: 12, label: "Size" },
};

/** Alpha ships a panel; it reads its live value and can set it. */
function AlphaPanel({ handle }: SettingsPanelProps<typeof alphaFields>) {
  const values = useSection(handle);
  return (
    <div>
      <p data-testid="alpha-greeting">{values.greeting}</p>
      <button onClick={() => handle.set("greeting", "changed")}>
        Change greeting
      </button>
    </div>
  );
}

const alpha: SettingsContribution = defineSettingsContribution({
  definition: { id: "alpha", title: "Alpha", fields: alphaFields },
  panel: AlphaPanel,
});

// Beta ships no panel - it exercises the "contributed section without a panel"
// path (a navigable entry plus reset, but a placeholder body).
const beta: SettingsContribution = defineSettingsContribution({
  definition: { id: "beta", title: "Beta", fields: betaFields },
});

function renderSettings(
  contributions: SettingsContribution[],
  store: PreferenceStore = createPreferenceStore(),
): PreferenceStore {
  render(
    <PreferenceStoreProvider store={store}>
      <SettingsProvider contributions={contributions}>
        <SettingsScreen />
      </SettingsProvider>
    </PreferenceStoreProvider>,
  );
  return store;
}

function sectionNav(): HTMLElement {
  return screen.getByRole("navigation", { name: /settings sections/i });
}

describe("SettingsScreen", () => {
  it("lists every registered section as a navigable entry", () => {
    renderSettings([alpha, beta]);

    const nav = sectionNav();
    expect(within(nav).getByText(/alpha/i)).toBeInTheDocument();
    expect(within(nav).getByText(/beta/i)).toBeInTheDocument();
  });

  it("renders the contributed panel of the section selected by default", () => {
    renderSettings([alpha, beta]);

    // Alpha is first, so its panel shows on first paint.
    expect(screen.getByTestId("alpha-greeting")).toHaveTextContent("hi");
  });

  it("switches the rendered panel when another section entry is activated", () => {
    renderSettings([alpha, beta]);

    expect(screen.getByTestId("alpha-greeting")).toBeInTheDocument();

    fireEvent.click(within(sectionNav()).getByText(/beta/i));

    // Alpha's panel is gone; Beta has no contributed panel, so a placeholder
    // stands in - the seam still renders the section, just without a body.
    expect(screen.queryByTestId("alpha-greeting")).not.toBeInTheDocument();
    expect(screen.getByText(/no settings/i)).toBeInTheDocument();
  });

  it("re-renders a contributed panel when its value changes", () => {
    renderSettings([alpha]);

    fireEvent.click(screen.getByRole("button", { name: /change greeting/i }));

    expect(screen.getByTestId("alpha-greeting")).toHaveTextContent("changed");
  });

  it("resets only the active section back to its defaults", () => {
    const store = renderSettings([alpha, beta]);

    // Dirty both sections.
    fireEvent.click(screen.getByRole("button", { name: /change greeting/i }));
    expect(screen.getByTestId("alpha-greeting")).toHaveTextContent("changed");
    act(() => {
      store.getSection("beta")!.set("size", 99);
    });

    // Reset the active (Alpha) section.
    fireEvent.click(screen.getByRole("button", { name: /reset.*default/i }));

    // Alpha is back to its default...
    expect(screen.getByTestId("alpha-greeting")).toHaveTextContent("hi");
    // ...and Beta's override is untouched (reset is section-scoped).
    expect(store.getSection("beta")!.get("size")).toBe(99);
  });

  it("shows an empty state when no sections are registered", () => {
    renderSettings([]);

    expect(
      screen.getByRole("heading", { level: 2, name: /settings/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no settings sections/i)).toBeInTheDocument();
  });
});
