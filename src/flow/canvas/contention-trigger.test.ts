import { describe, it, expect } from "vitest";

import { stepContentionTrigger } from "./contention-trigger";

/**
 * `stepContentionTrigger` is the pure keystroke reducer behind the flow sheet's
 * C# trigger: it accumulates a typed token and, on Enter, decides whether that
 * token is a contention trigger to fire. Driving it as pure state transitions
 * (no DOM) is what makes the fluid "type C1, press Enter" gesture testable.
 */
describe("stepContentionTrigger", () => {
  const type = (keys: string[]) =>
    keys.reduce<{ buffer: string; create: number | null }>(
      (state, key) => stepContentionTrigger(state.buffer, key),
      { buffer: "", create: null },
    );

  it("buffers alphanumeric keystrokes without firing", () => {
    expect(stepContentionTrigger("", "C")).toEqual({
      buffer: "C",
      create: null,
    });
    expect(stepContentionTrigger("C", "1")).toEqual({
      buffer: "C1",
      create: null,
    });
  });

  it("fires the contention number on Enter after a valid trigger", () => {
    expect(type(["C", "1", "Enter"])).toEqual({ buffer: "", create: 1 });
    expect(type(["C", "1", "2", "Enter"])).toEqual({ buffer: "", create: 12 });
    expect(type(["c", "2", "Enter"])).toEqual({ buffer: "", create: 2 });
  });

  it("clears the buffer on Enter without firing when the token is not a trigger", () => {
    expect(type(["X", "1", "Enter"])).toEqual({ buffer: "", create: null });
    expect(stepContentionTrigger("", "Enter")).toEqual({
      buffer: "",
      create: null,
    });
  });

  it("resets the buffer on a non-alphanumeric key (Escape, Space, ...)", () => {
    expect(stepContentionTrigger("C1", "Escape")).toEqual({
      buffer: "",
      create: null,
    });
    expect(stepContentionTrigger("C1", " ")).toEqual({
      buffer: "",
      create: null,
    });
    // A reset mid-token means a later Enter no longer fires.
    expect(type(["C", "1", "Escape", "Enter"])).toEqual({
      buffer: "",
      create: null,
    });
  });
});
