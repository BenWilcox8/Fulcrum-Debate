import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpeechTimer } from "./SpeechTimer";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function speechLabel() {
  return screen.getByTestId("speech-label");
}

describe("SpeechTimer", () => {
  it("labels the running speech with the first option by default", () => {
    render(<SpeechTimer />);
    expect(speechLabel()).toHaveTextContent("AC");
  });

  it("selecting a speech relabels the running speech", () => {
    render(<SpeechTimer />);
    const selector = screen.getByRole("group", { name: /select speech/i });

    fireEvent.click(within(selector).getByRole("button", { name: "CX" }));
    expect(speechLabel()).toHaveTextContent("CX");

    fireEvent.click(within(selector).getByRole("button", { name: "AR" }));
    expect(speechLabel()).toHaveTextContent("AR");
  });

  it("> advances through AC, NC, CX, AR and wraps back to AC", () => {
    render(<SpeechTimer />);
    const advance = screen.getByRole("button", { name: /advance to next speech/i });

    expect(speechLabel()).toHaveTextContent("AC");
    fireEvent.click(advance);
    expect(speechLabel()).toHaveTextContent("NC");
    fireEvent.click(advance);
    expect(speechLabel()).toHaveTextContent("CX");
    fireEvent.click(advance);
    expect(speechLabel()).toHaveTextContent("AR");
    fireEvent.click(advance);
    expect(speechLabel()).toHaveTextContent("AC"); // wraps
  });

  it("switching speeches does not disturb the running countdown", () => {
    render(<SpeechTimer />);

    fireEvent.click(screen.getByRole("button", { name: /play speech timer/i }));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("button", { name: "Speech time" })).toHaveTextContent(
      "4:55",
    );

    fireEvent.click(screen.getByRole("button", { name: /advance to next speech/i }));
    expect(speechLabel()).toHaveTextContent("NC");
    // countdown keeps running through the switch
    expect(screen.getByRole("button", { name: "Speech time" })).toHaveTextContent(
      "4:55",
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("button", { name: "Speech time" })).toHaveTextContent(
      "4:50",
    );
  });

  it("plays, resets, and edits like the prep timers", () => {
    render(<SpeechTimer />);

    fireEvent.click(screen.getByRole("button", { name: /play speech timer/i }));
    act(() => vi.advanceTimersByTime(10000));
    fireEvent.click(screen.getByRole("button", { name: /reset speech timer/i }));
    expect(screen.getByRole("button", { name: "Speech time" })).toHaveTextContent(
      "5:00",
    );

    fireEvent.click(screen.getByRole("button", { name: "Speech time" }));
    const input = screen.getByRole("textbox", { name: "Speech time" });
    fireEvent.change(input, { target: { value: "2:00" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("button", { name: "Speech time" })).toHaveTextContent(
      "2:00",
    );
  });
});
