// The pure keystroke reducer behind the flow sheet's S# subpoint trigger, driven
// as keystroke transitions (the same shape as the C# contention reducer). No
// DOM, no document - just (buffer, key) -> next buffer + optional create.
import { describe, it, expect } from "vitest";

import { stepSubpointTrigger } from "./subpoint-trigger";

describe("stepSubpointTrigger", () => {
  it("accumulates alphanumeric keys into the buffer without firing", () => {
    let step = stepSubpointTrigger("", "S");
    expect(step).toEqual({ buffer: "S", create: null });
    step = stepSubpointTrigger(step.buffer, "1");
    expect(step).toEqual({ buffer: "S1", create: null });
  });

  it("commits a valid S# token on Enter and clears the buffer", () => {
    expect(stepSubpointTrigger("S1", "Enter")).toEqual({
      buffer: "",
      create: 1,
    });
    expect(stepSubpointTrigger("S12", "Enter")).toEqual({
      buffer: "",
      create: 12,
    });
  });

  it("does not fire early: S1 keeps buffering toward S12", () => {
    // Typing S, 1, 2 must not fire at S1 - only Enter commits.
    let step = stepSubpointTrigger("", "S");
    step = stepSubpointTrigger(step.buffer, "1");
    step = stepSubpointTrigger(step.buffer, "2");
    expect(step).toEqual({ buffer: "S12", create: null });
  });

  it("clears the buffer without firing on Enter over an invalid token", () => {
    expect(stepSubpointTrigger("S", "Enter")).toEqual({
      buffer: "",
      create: null,
    });
    expect(stepSubpointTrigger("hello", "Enter")).toEqual({
      buffer: "",
      create: null,
    });
  });

  it("abandons a half-typed token on any non-alphanumeric key", () => {
    expect(stepSubpointTrigger("S1", " ")).toEqual({ buffer: "", create: null });
    expect(stepSubpointTrigger("S1", "Backspace")).toEqual({
      buffer: "",
      create: null,
    });
    expect(stepSubpointTrigger("S1", "Escape")).toEqual({
      buffer: "",
      create: null,
    });
  });
});
