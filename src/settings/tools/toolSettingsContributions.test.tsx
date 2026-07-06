import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

import {
  PreferenceStoreProvider,
  createPreferenceStore,
  type PreferenceField,
} from "../../preferences";
import {
  createCardToolRegistry,
  toolSectionId,
  type CardToolDefinition,
} from "../../tools";
import { SettingsProvider } from "../SettingsProvider";
import SettingsScreen from "../SettingsScreen";
import { toolSettingsContributions } from "./toolSettingsContributions";

/**
 * A recording tool: `applyToSelection` never touches the editor, it just records
 * the settings snapshot it was handed, so a test can assert exactly what the
 * registry forwarded when the tool is invoked - proving a Settings edit is
 * observed live by a consuming tool. Mirrors the registry test's recorder.
 */
function makeRecordingTool() {
  const calls: { prefix: string; stepSize: number }[] = [];
  const definition: CardToolDefinition<{
    prefix: PreferenceField<string>;
    stepSize: PreferenceField<number>;
  }> = {
    id: "recorder",
    label: "Recorder",
    description: "Records the settings it runs with.",
    settings: {
      prefix: { default: ">> ", label: "Prefix" },
      stepSize: { default: 2, label: "Step size" },
    },
    applyToSelection(_editor, settings) {
      calls.push({ ...settings });
      return true;
    },
  };
  return { definition, calls };
}

const stubEditor = {} as Editor;

describe("toolSettingsContributions", () => {
  it("builds one settings contribution per tool, keyed to its namespaced section", () => {
    const { definition } = makeRecordingTool();

    const [contribution, ...rest] = toolSettingsContributions([definition]);

    expect(rest).toHaveLength(0);
    expect(contribution.definition.id).toBe(toolSectionId(definition.id));
    expect(contribution.definition.title).toBe(definition.label);
    expect(contribution.definition.fields).toBe(definition.settings);
    // Every tool's settings render through the generic schema-driven panel.
    expect(contribution.panel).toBeTypeOf("function");
  });

  it("surfaces a registered tool's settings in the Settings screen, generated from its schema", () => {
    const { definition } = makeRecordingTool();
    const store = createPreferenceStore();

    render(
      <PreferenceStoreProvider store={store}>
        <SettingsProvider contributions={toolSettingsContributions([definition])}>
          <SettingsScreen />
        </SettingsProvider>
      </PreferenceStoreProvider>,
    );

    // The tool is a navigable section, listed by its label...
    const nav = screen.getByRole("navigation", { name: /settings sections/i });
    expect(within(nav).getByText(/recorder/i)).toBeInTheDocument();

    // ...and its declared settings render as generated controls.
    expect(screen.getByLabelText(/prefix/i)).toHaveValue(">> ");
    expect(screen.getByLabelText(/step size/i)).toHaveValue(2);
  });

  it("applies a Settings edit live to a consuming tool", () => {
    const { definition, calls } = makeRecordingTool();
    const store = createPreferenceStore();
    // The tool is registered on the same store the Settings screen edits, so its
    // live settings and the UI point at one section.
    const registry = createCardToolRegistry(store);
    const tool = registry.register(definition);

    render(
      <PreferenceStoreProvider store={store}>
        <SettingsProvider contributions={toolSettingsContributions([definition])}>
          <SettingsScreen />
        </SettingsProvider>
      </PreferenceStoreProvider>,
    );

    fireEvent.change(screen.getByLabelText(/step size/i), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByLabelText(/prefix/i), {
      target: { value: "## " },
    });

    // The consuming tool reads its live settings on invocation.
    tool.apply(stubEditor);
    expect(calls.at(-1)).toEqual({ prefix: "## ", stepSize: 9 });
  });

  it("resets a tool's settings to its declared defaults from the Settings screen", () => {
    const { definition } = makeRecordingTool();
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);
    const tool = registry.register(definition);

    render(
      <PreferenceStoreProvider store={store}>
        <SettingsProvider contributions={toolSettingsContributions([definition])}>
          <SettingsScreen />
        </SettingsProvider>
      </PreferenceStoreProvider>,
    );

    fireEvent.change(screen.getByLabelText(/step size/i), {
      target: { value: "9" },
    });
    expect(tool.settings.get("stepSize")).toBe(9);

    fireEvent.click(screen.getByRole("button", { name: /reset.*default/i }));

    // Back to the tool's declared default, live in the control and in settings.
    expect(tool.settings.get("stepSize")).toBe(2);
    expect(screen.getByLabelText(/step size/i)).toHaveValue(2);
  });
});
