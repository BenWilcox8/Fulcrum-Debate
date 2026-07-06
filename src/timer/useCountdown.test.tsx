import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCountdown } from "./useCountdown";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function tick(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

describe("useCountdown", () => {
  it("starts paused at the initial time and does not tick", () => {
    const { result } = renderHook(() => useCountdown(180));

    expect(result.current.seconds).toBe(180);
    expect(result.current.running).toBe(false);

    tick(3);
    expect(result.current.seconds).toBe(180);
  });

  it("counts down one second per second while running", () => {
    const { result } = renderHook(() => useCountdown(180));

    act(() => result.current.start());
    expect(result.current.running).toBe(true);

    tick(5);
    expect(result.current.seconds).toBe(175);
  });

  it("pauses and resumes, holding the remaining time while paused", () => {
    const { result } = renderHook(() => useCountdown(60));

    act(() => result.current.start());
    tick(10);
    expect(result.current.seconds).toBe(50);

    act(() => result.current.pause());
    tick(10);
    expect(result.current.seconds).toBe(50); // frozen while paused

    act(() => result.current.start());
    tick(5);
    expect(result.current.seconds).toBe(45);
  });

  it("toggle flips between running and paused", () => {
    const { result } = renderHook(() => useCountdown(60));

    act(() => result.current.toggle());
    expect(result.current.running).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.running).toBe(false);
  });

  it("clamps at 0 and auto-pauses instead of going negative", () => {
    const { result } = renderHook(() => useCountdown(3));

    act(() => result.current.start());
    tick(10);

    expect(result.current.seconds).toBe(0);
    expect(result.current.running).toBe(false);
  });

  it("reset stops the clock and restores the initial default", () => {
    const { result } = renderHook(() => useCountdown(180));

    act(() => result.current.start());
    tick(30);
    expect(result.current.seconds).toBe(150);

    act(() => result.current.reset());
    expect(result.current.seconds).toBe(180);
    expect(result.current.running).toBe(false);
  });

  it("setSeconds edits the live countdown without changing the reset baseline", () => {
    const { result } = renderHook(() => useCountdown(180));

    act(() => result.current.setSeconds(90));
    expect(result.current.seconds).toBe(90);

    act(() => result.current.start());
    tick(5);
    expect(result.current.seconds).toBe(85); // counts down from the edited value

    act(() => result.current.reset());
    expect(result.current.seconds).toBe(180); // reset still returns to the default
  });

  it("start and toggle work under StrictMode (updaters stay pure)", () => {
    // StrictMode double-invokes state updaters in dev; a setter nested inside
    // another setter's updater would toggle twice and no-op. Guard against that
    // regression by driving the controls under an actual StrictMode tree.
    const { result } = renderHook(() => useCountdown(60), { wrapper: StrictMode });

    act(() => result.current.start());
    expect(result.current.running).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.running).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.running).toBe(true);

    tick(5);
    expect(result.current.seconds).toBe(55);
  });

  it("does not start a spent (0:00) timer", () => {
    const { result } = renderHook(() => useCountdown(0));

    act(() => result.current.start());
    expect(result.current.running).toBe(false);
  });
});
