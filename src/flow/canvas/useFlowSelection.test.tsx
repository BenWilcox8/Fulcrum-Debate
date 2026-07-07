import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useFlowSelection } from "./useFlowSelection";

describe("useFlowSelection", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useFlowSelection());
    expect(result.current.count).toBe(0);
    expect(result.current.isSelected("a")).toBe(false);
    expect([...result.current.selectedNodeIds]).toEqual([]);
  });

  it("toggles a container into and out of the selection (Shift+Click again deselects)", () => {
    const { result } = renderHook(() => useFlowSelection());

    act(() => result.current.toggle("c1"));
    expect(result.current.isSelected("c1")).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle("c1"));
    expect(result.current.isSelected("c1")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("multi-selects several containers independently", () => {
    const { result } = renderHook(() => useFlowSelection());

    act(() => result.current.toggle("c1"));
    act(() => result.current.toggle("s2"));
    act(() => result.current.toggle("c3"));

    expect(result.current.count).toBe(3);
    expect(result.current.isSelected("c1")).toBe(true);
    expect(result.current.isSelected("s2")).toBe(true);
    expect(result.current.isSelected("c3")).toBe(true);

    // Deselecting one leaves the others.
    act(() => result.current.toggle("s2"));
    expect(result.current.count).toBe(2);
    expect(result.current.isSelected("s2")).toBe(false);
    expect(result.current.isSelected("c1")).toBe(true);
  });

  it("clear() empties the whole selection", () => {
    const { result } = renderHook(() => useFlowSelection());
    act(() => result.current.toggle("c1"));
    act(() => result.current.toggle("c2"));
    expect(result.current.count).toBe(2);

    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
    expect([...result.current.selectedNodeIds]).toEqual([]);
  });

  it("keeps a stable snapshot reference across a no-op clear", () => {
    const { result } = renderHook(() => useFlowSelection());
    const before = result.current.selectedNodeIds;
    act(() => result.current.clear());
    expect(result.current.selectedNodeIds).toBe(before);
  });
});
