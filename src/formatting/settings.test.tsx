import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import {
  PreferenceStoreProvider,
  createPreferenceStore,
  useSection,
} from "../preferences";
import { SettingsProvider } from "../settings";
import SettingsScreen from "../settings/SettingsScreen";
import {
  FONT_FAMILY_OPTIONS,
  FORMATTING_TARGET_KEYS,
  FORMATTING_TARGET_LABELS,
} from "./profile";
import {
  registerFormattingSection,
  type FormattingSectionHandle,
} from "./preferences";
import { FormattingSettingsPanel } from "./FormattingSettingsPanel";
import { formattingSettingsContribution } from "./formattingSettings";

/**
 * Renders the panel against a freshly-registered formatting section plus an
 * independent consumer that reads the same handle - so a write from the panel's
 * controls must show up live in the consumer (the reactive-bindings assertion the
 * task requires).
 */
function renderPanel(): { handle: FormattingSectionHandle } {
  const store = createPreferenceStore();
  const handle = registerFormattingSection(store);

  function Consumer() {
    const values = useSection(handle);
    const body = values.body;
    return (
      <dl>
        <dt>body-font</dt>
        <dd data-testid="consume-body-font">{body.fontFamily}</dd>
        <dt>body-size</dt>
        <dd data-testid="consume-body-size">{body.fontSize}</dd>
        <dt>body-color</dt>
        <dd data-testid="consume-body-color">{body.color}</dd>
        <dt>tag-bold</dt>
        <dd data-testid="consume-tag-bold">{String(values.tag.bold)}</dd>
      </dl>
    );
  }

  render(
    <PreferenceStoreProvider store={store}>
      <FormattingSettingsPanel handle={handle} />
      <Consumer />
    </PreferenceStoreProvider>,
  );
  return { handle };
}

function targetGroup(label: string): HTMLElement {
  return screen.getByRole("group", { name: new RegExp(`^${label}$`, "i") });
}

describe("FormattingSettingsPanel", () => {
  it("renders a labelled control group for every formatting target", () => {
    renderPanel();

    for (const key of FORMATTING_TARGET_KEYS) {
      const label = FORMATTING_TARGET_LABELS[key];
      const group = targetGroup(label);
      // Each group exposes font, size and color controls.
      expect(within(group).getByLabelText(/font/i)).toBeInTheDocument();
      expect(within(group).getByLabelText(/size/i)).toBeInTheDocument();
      expect(within(group).getByLabelText(/color/i)).toBeInTheDocument();
    }
  });

  it("shows each target's current font, size and color in its controls", () => {
    renderPanel();

    const body = targetGroup(FORMATTING_TARGET_LABELS.body);
    expect(within(body).getByLabelText(/font/i)).toHaveValue("Calibri");
    // Size is a point string ("12pt"); the numeric control carries the number.
    expect(within(body).getByLabelText(/size/i)).toHaveValue(12);
    expect(within(body).getByLabelText(/color/i)).toHaveValue("#000000");
  });

  it("offers the shared font-family options as native suggestions", () => {
    renderPanel();

    const body = targetGroup(FORMATTING_TARGET_LABELS.body);
    const fontInput = within(body).getByLabelText(/font/i) as HTMLInputElement;
    const listId = fontInput.getAttribute("list");
    expect(listId).toBeTruthy();

    const datalist = document.getElementById(listId!);
    expect(datalist).not.toBeNull();
    const optionValues = Array.from(
      datalist!.querySelectorAll("option"),
    ).map((option) => option.getAttribute("value"));
    for (const family of FONT_FAMILY_OPTIONS) {
      expect(optionValues).toContain(family);
    }
  });

  it("applies a font edit live to a consuming read", () => {
    renderPanel();

    const body = targetGroup(FORMATTING_TARGET_LABELS.body);
    fireEvent.change(within(body).getByLabelText(/font/i), {
      target: { value: "Georgia" },
    });

    expect(screen.getByTestId("consume-body-font")).toHaveTextContent("Georgia");
  });

  it("writes a size edit back as a point string, live", () => {
    renderPanel();

    const body = targetGroup(FORMATTING_TARGET_LABELS.body);
    fireEvent.change(within(body).getByLabelText(/size/i), {
      target: { value: "14" },
    });

    expect(screen.getByTestId("consume-body-size")).toHaveTextContent("14pt");
  });

  it("applies a color edit live to a consuming read", () => {
    renderPanel();

    const body = targetGroup(FORMATTING_TARGET_LABELS.body);
    fireEvent.change(within(body).getByLabelText(/color/i), {
      target: { value: "#ff0000" },
    });

    expect(screen.getByTestId("consume-body-color")).toHaveTextContent(
      "#ff0000",
    );
  });

  it("toggles a target's bold flag live, isolated to that target", () => {
    const { handle } = renderPanel();

    const tag = targetGroup(FORMATTING_TARGET_LABELS.tag);
    // Tag defaults to bold; un-bold it.
    fireEvent.click(within(tag).getByLabelText(/bold/i));

    expect(screen.getByTestId("consume-tag-bold")).toHaveTextContent("false");
    // Editing the tag entry left every other target untouched.
    expect(handle.get("body").bold).toBe(false);
    expect(handle.get("body").fontSize).toBe("12pt");
  });

  it("edits one target without disturbing the others", () => {
    const { handle } = renderPanel();

    const cite = targetGroup(FORMATTING_TARGET_LABELS.cite);
    fireEvent.change(within(cite).getByLabelText(/color/i), {
      target: { value: "#123456" },
    });

    expect(handle.get("cite").color).toBe("#123456");
    // Body is unchanged.
    expect(handle.get("body").color).toBe("#000000");
  });
});

describe("formattingSettingsContribution", () => {
  it("contributes a Formatting section with a panel to the Settings screen", () => {
    const store = createPreferenceStore();

    render(
      <PreferenceStoreProvider store={store}>
        <SettingsProvider contributions={[formattingSettingsContribution]}>
          <SettingsScreen />
        </SettingsProvider>
      </PreferenceStoreProvider>,
    );

    // The section is listed by its title in the settings nav...
    const nav = screen.getByRole("navigation", { name: /settings sections/i });
    expect(within(nav).getByText(/formatting/i)).toBeInTheDocument();

    // ...and its panel renders (Formatting is the first/only section, so it is
    // active on first paint): every target group is present.
    for (const key of FORMATTING_TARGET_KEYS) {
      expect(
        screen.getByRole("group", {
          name: new RegExp(`^${FORMATTING_TARGET_LABELS[key]}$`, "i"),
        }),
      ).toBeInTheDocument();
    }
  });
});
