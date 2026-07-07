import { describe, it, expect } from "vitest";

import {
  DEFAULT_DOCK_LAYOUT,
  DEFAULT_DOCK_SIZES,
  MAX_DOCK_SIZE,
  type DockLayout,
} from "./dock-layout";
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

const layout = (
  position: DockLayout["position"],
  sizes: Record<"side" | "bottom", number>,
): DockLayout => ({ position, sizes });

describe("dock-layout persistence", () => {
  it("round-trips a written layout through the same storage", () => {
    const storage = memoryStorage();
    const value = layout("bottom", { side: 0.4, bottom: 0.35 });
    writeDockLayout(value, storage);
    expect(readDockLayout(storage)).toEqual(value);
    // Persisted under the well-known key as JSON.
    expect(JSON.parse(storage.data[DOCK_LAYOUT_STORAGE_KEY])).toEqual(value);
  });

  it("normalizes an out-of-range size before writing", () => {
    const storage = memoryStorage();
    writeDockLayout(layout("side", { side: 3, bottom: 0.3 }), storage);
    expect(readDockLayout(storage)).toEqual(
      layout("side", { side: MAX_DOCK_SIZE, bottom: 0.3 }),
    );
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
      [DOCK_LAYOUT_STORAGE_KEY]: JSON.stringify({
        position: "??",
        sizes: { side: 0.5, bottom: 0.3 },
      }),
    });
    expect(readDockLayout(storage)).toEqual(
      layout(DEFAULT_DOCK_LAYOUT.position, { side: 0.5, bottom: 0.3 }),
    );
  });

  it("migrates a legacy single-size value onto its stored edge", () => {
    // Old shape written before per-edge sizes: the size belongs to the persisted
    // position; the other edge falls back to its default.
    const storage = memoryStorage({
      [DOCK_LAYOUT_STORAGE_KEY]: JSON.stringify({ position: "bottom", size: 0.5 }),
    });
    expect(readDockLayout(storage)).toEqual(
      layout("bottom", { side: DEFAULT_DOCK_SIZES.side, bottom: 0.5 }),
    );
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
      writeDockLayout(layout("bottom", { side: 0.4, bottom: 0.5 }), throwing),
    ).not.toThrow();
  });
});
