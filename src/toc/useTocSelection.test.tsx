/**
 * Behavioral tests for {@link useTocSelection} - the ToC's transient per-heading
 * checkbox selection, keyed by heading position.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useTocSelection } from "./useTocSelection";

describe("useTocSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useTocSelection());
    expect(result.current.count).toBe(0);
    expect(result.current.isSelected(3)).toBe(false);
  });

  it("toggles a heading in and out and supports multi-select", () => {
    const { result } = renderHook(() => useTocSelection());

    act(() => result.current.toggle(3));
    act(() => result.current.toggle(9));
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected(3)).toBe(true);
    expect(result.current.isSelected(9)).toBe(true);

    act(() => result.current.toggle(3));
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected(3)).toBe(false);
    expect(result.current.isSelected(9)).toBe(true);
  });

  it("clears the whole selection", () => {
    const { result } = renderHook(() => useTocSelection());
    act(() => result.current.toggle(1));
    act(() => result.current.toggle(2));

    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
    expect(result.current.selectedPositions.size).toBe(0);
  });

  it("keeps a stable selectedPositions reference when nothing changed", () => {
    const { result } = renderHook(() => useTocSelection());
    const first = result.current.selectedPositions;
    act(() => result.current.clear()); // already empty - must not re-reference
    expect(result.current.selectedPositions).toBe(first);
  });
});
