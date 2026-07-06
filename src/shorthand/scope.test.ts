/**
 * Behavioural tests for the surface-generic shorthand **scope gate**. Pure, so no
 * editor or store is needed - it is the whole decision "does expansion run on this
 * surface under this scope", and the acceptance-criteria gate: `"speech"` /
 * `"neither"` disable the flow surface.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHORTHAND_SCOPE,
  SHORTHAND_SCOPES,
  isShorthandEnabledForSurface,
  type ShorthandScope,
  type ShorthandSurface,
} from "./scope";

const SURFACES: ShorthandSurface[] = ["flow", "speech"];

describe("shorthand scope", () => {
  it("defaults to expanding on both surfaces", () => {
    expect(DEFAULT_SHORTHAND_SCOPE).toBe("both");
  });

  it("enumerates every scope with 'both' first (the recommended default)", () => {
    expect(SHORTHAND_SCOPES).toEqual(["both", "flow", "speech", "neither"]);
    expect(SHORTHAND_SCOPES[0]).toBe(DEFAULT_SHORTHAND_SCOPE);
  });

  it("'both' enables every surface", () => {
    for (const surface of SURFACES) {
      expect(isShorthandEnabledForSurface("both", surface)).toBe(true);
    }
  });

  it("'neither' disables every surface", () => {
    for (const surface of SURFACES) {
      expect(isShorthandEnabledForSurface("neither", surface)).toBe(false);
    }
  });

  it("a surface-named scope enables only the matching surface", () => {
    expect(isShorthandEnabledForSurface("flow", "flow")).toBe(true);
    expect(isShorthandEnabledForSurface("flow", "speech")).toBe(false);
    expect(isShorthandEnabledForSurface("speech", "speech")).toBe(true);
    expect(isShorthandEnabledForSurface("speech", "flow")).toBe(false);
  });

  it("gates the flow surface: only 'both' and 'flow' enable it", () => {
    const enablesFlow = (scope: ShorthandScope) =>
      isShorthandEnabledForSurface(scope, "flow");
    expect(SHORTHAND_SCOPES.filter(enablesFlow)).toEqual(["both", "flow"]);
    // The acceptance criterion, stated directly.
    expect(enablesFlow("speech")).toBe(false);
    expect(enablesFlow("neither")).toBe(false);
  });

  it("is surface-generic: a new surface identity is gated by the same rule", () => {
    // A hypothetical future surface passes its own key; the gate needs no change:
    // "both" enables it, "neither" disables it, and a non-matching named scope
    // (here "flow") excludes it - exactly the flow/speech behaviour.
    const future = "notecard" as ShorthandSurface;
    expect(isShorthandEnabledForSurface("both", future)).toBe(true);
    expect(isShorthandEnabledForSurface("neither", future)).toBe(false);
    expect(isShorthandEnabledForSurface("flow", future)).toBe(false);
  });
});
