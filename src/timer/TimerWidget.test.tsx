import { render, screen, within } from "@testing-library/react";
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
});
