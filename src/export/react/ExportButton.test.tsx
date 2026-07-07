/**
 * Behavioral tests for the **one-click Export action** UI. They drive the button
 * with stub targets (the transport never runs) and assert the non-intrusive
 * success/failure feedback the PRD requires - the reporting seam - plus the
 * one-button-per-target pluggability, the nothing-to-export no-op, and the
 * disabled state.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ExportButton } from "./ExportButton";
import type { ExportPayload, ExportTarget } from "../target";

const payload: ExportPayload = { subject: "S", html: "<p>h</p>", text: "t" };

function stubTarget(
  overrides: Partial<ExportTarget> & Pick<ExportTarget, "export">,
): ExportTarget {
  return { id: "email", label: "Email", ...overrides };
}

describe("ExportButton", () => {
  it("assembles the payload on click and hands it to the target", async () => {
    const exportFn = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Opened a draft." });
    const buildPayload = vi.fn(() => payload);

    render(
      <ExportButton
        buildPayload={buildPayload}
        targets={[stubTarget({ export: exportFn })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /export to email/i }));

    expect(buildPayload).toHaveBeenCalledTimes(1);
    expect(exportFn).toHaveBeenCalledWith(payload);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Opened a draft."),
    );
  });

  it("reports a target failure non-intrusively", async () => {
    const exportFn = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Could not open your mail app." });

    render(
      <ExportButton
        buildPayload={() => payload}
        targets={[stubTarget({ export: exportFn })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /export to email/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Could not open your mail app.",
      ),
    );
  });

  it("reports a gentle no-op when there is nothing to export", async () => {
    const exportFn = vi.fn();

    render(
      <ExportButton
        buildPayload={() => null}
        targets={[stubTarget({ export: exportFn })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /export to email/i }));

    expect(exportFn).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/nothing to export/i),
    );
  });

  it("renders one button per target, so a new target needs no action change", () => {
    render(
      <ExportButton
        buildPayload={() => payload}
        targets={[
          stubTarget({ id: "email", label: "Email", export: vi.fn() }),
          stubTarget({ id: "speechdrop", label: "SpeechDrop", export: vi.fn() }),
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: /export to email/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /export to speechdrop/i }),
    ).toBeInTheDocument();
  });

  it("disables the action when told the surface is not ready", () => {
    render(
      <ExportButton
        disabled
        buildPayload={() => payload}
        targets={[stubTarget({ export: vi.fn() })]}
      />,
    );

    expect(screen.getByRole("button", { name: /export to email/i })).toBeDisabled();
  });
});
