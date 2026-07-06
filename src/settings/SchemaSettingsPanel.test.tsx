import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { createPreferenceStore, useSection } from "../preferences";
import { SchemaSettingsPanel } from "./SchemaSettingsPanel";

/**
 * A representative section mixing every control the generic, schema-driven panel
 * knows how to render: a text field, a numeric field, a boolean toggle, and an
 * enumerated field (a `<select>`). Defaults are widened so the panel can set the
 * other value, matching the store-core convention.
 */
const fields = {
  prefix: {
    default: ">> ",
    label: "Prefix",
    description: "Text prepended to the run.",
  },
  stepSize: { default: 2, label: "Step size" },
  enabled: { default: true as boolean, label: "Enabled" },
  mode: {
    default: "trim" as string,
    label: "Mode",
    options: ["trim", "keep", "drop"] as string[],
  },
};

/**
 * Renders the panel plus an independent consumer reading the same handle, so a
 * write from a control must show up live in the consumer - the reactive-bindings
 * assertion the task requires. No provider is needed: `useSection` rides the
 * handle's own subscribe seam.
 */
function renderPanel() {
  const store = createPreferenceStore();
  const handle = store.registerSection({
    id: "sample",
    title: "Sample",
    fields,
  });

  function Consumer() {
    const values = useSection(handle);
    return (
      <dl>
        <dd data-testid="consume-prefix">{values.prefix}</dd>
        <dd data-testid="consume-stepSize">{String(values.stepSize)}</dd>
        <dd data-testid="consume-enabled">{String(values.enabled)}</dd>
        <dd data-testid="consume-mode">{values.mode}</dd>
      </dl>
    );
  }

  render(
    <>
      <SchemaSettingsPanel handle={handle} />
      <Consumer />
    </>,
  );
  return { handle };
}

describe("SchemaSettingsPanel", () => {
  it("renders a labelled control for every field in the schema", () => {
    renderPanel();

    expect(screen.getByLabelText(/prefix/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/step size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/enabled/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mode/i)).toBeInTheDocument();
  });

  it("shows each field's current value in its control", () => {
    renderPanel();

    expect(screen.getByLabelText(/prefix/i)).toHaveValue(">> ");
    expect(screen.getByLabelText(/step size/i)).toHaveValue(2);
    expect(screen.getByLabelText(/enabled/i)).toBeChecked();
    expect(screen.getByLabelText(/mode/i)).toHaveValue("trim");
  });

  it("renders a field's description as help text", () => {
    renderPanel();

    expect(screen.getByText(/text prepended to the run/i)).toBeInTheDocument();
  });

  it("offers every enumerated option in the select control", () => {
    renderPanel();

    const select = screen.getByLabelText(/mode/i) as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["trim", "keep", "drop"]);
  });

  it("writes a text edit back to the section, live", () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/prefix/i), {
      target: { value: "## " },
    });

    expect(screen.getByTestId("consume-prefix")).toHaveTextContent("##");
  });

  it("writes a numeric edit back as a number, live", () => {
    const { handle } = renderPanel();

    fireEvent.change(screen.getByLabelText(/step size/i), {
      target: { value: "5" },
    });

    expect(screen.getByTestId("consume-stepSize")).toHaveTextContent("5");
    expect(handle.get("stepSize")).toBe(5);
  });

  it("toggles a boolean field, live", () => {
    const { handle } = renderPanel();

    fireEvent.click(screen.getByLabelText(/enabled/i));

    expect(screen.getByTestId("consume-enabled")).toHaveTextContent("false");
    expect(handle.get("enabled")).toBe(false);
  });

  it("writes an enumerated selection back to the section, live", () => {
    const { handle } = renderPanel();

    fireEvent.change(screen.getByLabelText(/mode/i), {
      target: { value: "keep" },
    });

    expect(screen.getByTestId("consume-mode")).toHaveTextContent("keep");
    expect(handle.get("mode")).toBe("keep");
  });
});
