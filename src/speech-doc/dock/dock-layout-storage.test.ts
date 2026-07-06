import { describe, it, expect } from "vitest";

import { DEFAULT_DOCK_LAYOUT, MAX_DOCK_SIZE } from "./dock-layout";
import {
  DOCK_LAYOUT_STORAGE_KEY,
  readDockLayout,
  writeDockLayout,
  type DockLayoutStorage,
} from "./dock-layout-storage";

/** A minimal in-memory Storage stub. */
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

describe("dock-layout persistence", () => {
  it("round-trips a written layout through the same storage", () => {
    const storage = memoryStorage();
    writeDockLayout({ position: "bottom", size: 0.35 }, storage);
    expect(readDockLayout(storage)).toEqual({ position: "bottom", size: 0.35 });
    // Persisted under the well-known key as JSON.
    expect(JSON.parse(storage.data[DOCK_LAYOUT_STORAGE_KEY])).toEqual({
      position: "bottom",
      size: 0.35,
    });
  });

  it("normalizes an out-of-range size before writing", () => {
    const storage = memoryStorage();
    writeDockLayout({ position: "side", size: 3 }, storage);
    expect(readDockLayout(storage)).toEqual({
      position: "side",
      size: MAX_DOCK_SIZE,
    });
  });

  it("returns the default when nothing is stored", () => {
    expect(readDockLayout(memoryStorage())).toEqual(DEFAULT_DOCK_LAYOUT);
  });

  it("returns the default for an unparseable stored value", () => {
    const storage = memoryStorage({ [DOCK_LAYOUT_STORAGE_KEY]: "{not json" });
    expect(readDockLayout(storage)).toEqual(DEFAULT_DOCK_LAYOUT);
  });

  it("normalizes a malformed but parseable stored value", () => {
    const storage = memoryStorage({
      [DOCK_LAYOUT_STORAGE_KEY]: JSON.stringify({ position: "??", size: 0.3 }),
    });
    expect(readDockLayout(storage)).toEqual({
      position: DEFAULT_DOCK_LAYOUT.position,
      size: 0.3,
    });
  });

  it("returns the default and never throws when storage is null", () => {
    expect(readDockLayout(null)).toEqual(DEFAULT_DOCK_LAYOUT);
    expect(() => writeDockLayout(DEFAULT_DOCK_LAYOUT, null)).not.toThrow();
  });

  it("swallows a storage write failure (best-effort persistence)", () => {
    const throwing: DockLayoutStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() =>
      writeDockLayout({ position: "bottom", size: 0.5 }, throwing),
    ).not.toThrow();
  });
});
