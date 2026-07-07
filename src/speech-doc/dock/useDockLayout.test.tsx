import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";

import {
  DEFAULT_DOCK_LAYOUT,
  DEFAULT_DOCK_SIZES,
  MIN_DOCK_SIZE,
  dockSizeFor,
} from "./dock-layout";
import {
  DOCK_LAYOUT_STORAGE_KEY,
  type DockLayoutStorage,
} from "./dock-layout-storage";
import { useDockLayout } from "./useDockLayout";

function memoryStorage(seed: Record<string, string> = {}): DockLayoutStorage & {
  data: Record<string, string>;
} {
  const data = { ...seed };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("useDockLayout", () => {
  it("seeds synchronously from the persisted layout", () => {
    const storage = memoryStorage({
      [DOCK_LAYOUT_STORAGE_KEY]: JSON.stringify({
        position: "bottom",
        sizes: { side: 0.4, bottom: 0.3 },
      }),
    });
    const { result } = renderHook(() => useDockLayout(storage));
    expect(result.current.layout).toEqual({
      position: "bottom",
      sizes: { side: 0.4, bottom: 0.3 },
    });
  });

  it("defaults when nothing is stored", () => {
    const { result } = renderHook(() => useDockLayout(memoryStorage()));
    expect(result.current.layout).toEqual(DEFAULT_DOCK_LAYOUT);
  });

  it("persists a position change and a per-edge size change immediately", () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useDockLayout(storage));

    act(() => result.current.setPosition("bottom"));
    expect(result.current.layout.position).toBe("bottom");

    act(() => result.current.setSize(0.55));
    // The size lands on the current (bottom) edge only.
    expect(dockSizeFor(result.current.layout)).toBeCloseTo(0.55, 5);

    const stored = JSON.parse(storage.data[DOCK_LAYOUT_STORAGE_KEY]);
    expect(stored.position).toBe("bottom");
    expect(stored.sizes.bottom).toBeCloseTo(0.55, 5);
    // The side edge keeps its default - the two edges are independent.
    expect(stored.sizes.side).toBeCloseTo(DEFAULT_DOCK_SIZES.side, 5);
  });

  it("keeps each edge's size independent when toggling position", () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useDockLayout(storage));

    // Size the side edge, then the bottom edge.
    act(() => result.current.setSize(0.6));
    act(() => result.current.setPosition("bottom"));
    act(() => result.current.setSize(0.25));

    // Toggling back to side restores the side fraction, not the bottom one.
    act(() => result.current.setPosition("side"));
    expect(dockSizeFor(result.current.layout)).toBeCloseTo(0.6, 5);
    act(() => result.current.setPosition("bottom"));
    expect(dockSizeFor(result.current.layout)).toBeCloseTo(0.25, 5);
  });

  it("clamps an out-of-range size on set", () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useDockLayout(storage));
    act(() => result.current.setSize(0));
    expect(dockSizeFor(result.current.layout)).toBe(MIN_DOCK_SIZE);
  });

  it("survives a reload: a fresh hook over the same storage sees the choice", () => {
    const storage = memoryStorage();
    const first = renderHook(() => useDockLayout(storage));
    act(() => first.result.current.setPosition("bottom"));
    act(() => first.result.current.setSize(0.7));
    first.unmount();

    // Remount as if after a page reload.
    const second = renderHook(() => useDockLayout(storage));
    expect(second.result.current.layout.position).toBe("bottom");
    expect(dockSizeFor(second.result.current.layout)).toBeCloseTo(0.7, 5);
  });

  it("does not persist when storage is explicitly disabled (null)", () => {
    const { result } = renderHook(() => useDockLayout(null));
    act(() => result.current.setPosition("bottom"));
    // In-memory only: the change is reflected but nothing throws / persists.
    expect(result.current.layout.position).toBe("bottom");
  });
});
