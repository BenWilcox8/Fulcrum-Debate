import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrepTimer } from "./PrepTimer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function region(name: RegExp) {
  return screen.getByRole("region", { name });
}

describe("PrepTimer", () => {
  it("defaults to 3:00 for each side", () => {
    render(<PrepTimer side="aff" />);
    expect(
      within(region(/aff prep timer/i)).getByRole("button", {
        name: "Aff prep time",
      }),
    ).toHaveTextContent("3:00");
  });

  it("labels and marks the side for colouring (data-side)", () => {
    render(<PrepTimer side="neg" />);
    const section = region(/neg prep timer/i);
    expect(section).toHaveAttribute("data-side", "neg");
    expect(within(section).getByText(/neg prep/i)).toBeInTheDocument();
  });

  it("plays, counts down, and pauses via the play/pause control", () => {
    render(<PrepTimer side="aff" />);
    const section = region(/aff prep timer/i);

    fireEvent.click(within(section).getByRole("button", { name: /play aff prep/i }));
    act(() => vi.advanceTimersByTime(4000));

    expect(
      within(section).getByRole("button", { name: "Aff prep time" }),
    ).toHaveTextContent("2:56");

    fireEvent.click(within(section).getByRole("button", { name: /pause aff prep/i }));
    act(() => vi.advanceTimersByTime(4000));
    expect(
      within(section).getByRole("button", { name: "Aff prep time" }),
    ).toHaveTextContent("2:56");
  });

  it("reset restores 3:00 after counting down", () => {
    render(<PrepTimer side="aff" />);
    const section = region(/aff prep timer/i);

    fireEvent.click(within(section).getByRole("button", { name: /play aff prep/i }));
    act(() => vi.advanceTimersByTime(10000));
    fireEvent.click(within(section).getByRole("button", { name: /reset aff prep/i }));

    expect(
      within(section).getByRole("button", { name: "Aff prep time" }),
    ).toHaveTextContent("3:00");
  });

  it("edits the prep time in place", () => {
    render(<PrepTimer side="aff" />);
    const section = region(/aff prep timer/i);

    fireEvent.click(within(section).getByRole("button", { name: "Aff prep time" }));
    const input = within(section).getByRole("textbox", { name: "Aff prep time" });
    fireEvent.change(input, { target: { value: "1:00" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(
      within(section).getByRole("button", { name: "Aff prep time" }),
    ).toHaveTextContent("1:00");
  });
});
