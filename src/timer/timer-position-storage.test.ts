import { describe, expect, it } from "vitest";

import { DEFAULT_TIMER_POSITION } from "./timer-position";
import {
  TIMER_POSITION_STORAGE_KEY,
  readTimerPosition,
  writeTimerPosition,
  type TimerPositionStorage,
} from "./timer-position-storage";

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

describe("timer-position-storage", () => {
  it("round-trips a position through storage", () => {
    const storage = memoryStorage();
    writeTimerPosition({ x: 0.25, y: 0.6 }, storage);
    expect(readTimerPosition(storage)).toEqual({ x: 0.25, y: 0.6 });
  });

  it("returns the default when nothing is stored", () => {
    expect(readTimerPosition(memoryStorage())).toEqual(DEFAULT_TIMER_POSITION);
  });

  it("degrades a malformed stored value to the default", () => {
    const storage = memoryStorage({ [TIMER_POSITION_STORAGE_KEY]: "not json" });
    expect(readTimerPosition(storage)).toEqual(DEFAULT_TIMER_POSITION);
  });

  it("normalizes an out-of-range stored value on read", () => {
    const storage = memoryStorage({
      [TIMER_POSITION_STORAGE_KEY]: JSON.stringify({ x: 9, y: -9 }),
    });
    expect(readTimerPosition(storage)).toEqual({ x: 1, y: 0 });
  });

  it("normalizes before writing", () => {
    const storage = memoryStorage();
    writeTimerPosition({ x: 5, y: -5 }, storage);
    expect(JSON.parse(storage.data[TIMER_POSITION_STORAGE_KEY])).toEqual({ x: 1, y: 0 });
  });

  it("is a no-op / default when storage is null", () => {
    expect(readTimerPosition(null)).toEqual(DEFAULT_TIMER_POSITION);
    expect(() => writeTimerPosition({ x: 0.5, y: 0.5 }, null)).not.toThrow();
  });

  it("swallows a storage failure on write", () => {
    const throwing: TimerPositionStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writeTimerPosition({ x: 0.5, y: 0.5 }, throwing)).not.toThrow();
  });
});
