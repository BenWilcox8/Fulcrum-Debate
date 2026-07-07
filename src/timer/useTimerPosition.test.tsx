import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEFAULT_TIMER_POSITION } from "./timer-position";
import {
  TIMER_POSITION_STORAGE_KEY,
  type TimerPositionStorage,
} from "./timer-position-storage";
import { useTimerPosition } from "./useTimerPosition";

function memoryStorage(seed: Record<string, string> = {}): TimerPositionStorage & {
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

describe("useTimerPosition", () => {
  it("seeds synchronously from storage", () => {
    const storage = memoryStorage({
      [TIMER_POSITION_STORAGE_KEY]: JSON.stringify({ x: 0.3, y: 0.7 }),
    });
    const { result } = renderHook(() => useTimerPosition(storage));
    expect(result.current.position).toEqual({ x: 0.3, y: 0.7 });
  });

  it("defaults when nothing is stored", () => {
    const { result } = renderHook(() => useTimerPosition(memoryStorage()));
    expect(result.current.position).toEqual(DEFAULT_TIMER_POSITION);
  });

  it("clamps and persists on set", () => {
    const storage = memoryStorage();
    const { result } = renderHook(() => useTimerPosition(storage));

    act(() => result.current.setPosition({ x: 5, y: 0.2 }));
    expect(result.current.position).toEqual({ x: 1, y: 0.2 });
    expect(JSON.parse(storage.data[TIMER_POSITION_STORAGE_KEY])).toEqual({ x: 1, y: 0.2 });
  });

  it("restores a set position on a remount (reload)", () => {
    const storage = memoryStorage();
    const first = renderHook(() => useTimerPosition(storage));
    act(() => first.result.current.setPosition({ x: 0.1, y: 0.9 }));
    first.unmount();

    const second = renderHook(() => useTimerPosition(storage));
    expect(second.result.current.position).toEqual({ x: 0.1, y: 0.9 });
  });

  it("stays in memory (no persistence) when storage is null", () => {
    const { result } = renderHook(() => useTimerPosition(null));
    act(() => result.current.setPosition({ x: 0.4, y: 0.4 }));
    expect(result.current.position).toEqual({ x: 0.4, y: 0.4 });
  });
});
