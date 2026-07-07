import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimerWidget } from "./TimerWidget";

describe("TimerWidget", () => {
  it("composes both side prep timers and the speech timer", () => {
    render(<TimerWidget />);

    expect(screen.getByRole("region", { name: /aff prep timer/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /neg prep timer/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^speech timer$/i })).toBeInTheDocument();
  });

  it("forwards round speech labels to the speech-timer selector", () => {
    render(<TimerWidget speeches={["Con Case", "Pro FF"]} />);

    const selector = screen.getByRole("group", { name: /select speech/i });
    expect(within(selector).getByRole("button", { name: "Con Case" })).toBeInTheDocument();
    expect(within(selector).getByRole("button", { name: "Pro FF" })).toBeInTheDocument();
    expect(within(selector).queryByRole("button", { name: "AC" })).toBeNull();
  });

  it("floats over the flow without blocking it: interactive card inside a pass-through overlay", () => {
    const { container } = render(<TimerWidget />);

    // The outer overlay spans its container but lets clicks fall through.
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toContain("pointer-events-none");
    expect(overlay.className).toContain("absolute");

    // Only the timers card captures pointer events.
    const card = screen.getByRole("region", { name: /^timers$/i });
    expect(card.className).toContain("pointer-events-auto");
    expect(within(card).getAllByRole("region").length).toBeGreaterThanOrEqual(3);
  });

  it("collapses to a compact bar so the flow beneath is reachable, then re-expands", () => {
    render(<TimerWidget />);

    // Expanded by default: the three timer regions are present.
    expect(screen.getAllByRole("region", { name: /prep timer|speech timer/i }).length).toBe(3);

    // Collapsing hides the timers (reclaiming the space over the flow) while the
    // card itself stays as a small labelled bar with an expand control.
    fireEvent.click(screen.getByRole("button", { name: /collapse timers/i }));
    const timerBody = screen.getByTestId("timer-body");
    expect(timerBody).toHaveClass("hidden");
    const collapseToggle = screen.getByRole("button", { name: /expand timers/i });
    expect(collapseToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("region", { name: /^timers$/i })).toHaveAttribute("data-collapsed", "true");

    // Expanding brings the timers back.
    fireEvent.click(collapseToggle);
    expect(timerBody).not.toHaveClass("hidden");
    expect(screen.getByRole("button", { name: /collapse timers/i })).toHaveAttribute("aria-expanded", "true");
  });
});
