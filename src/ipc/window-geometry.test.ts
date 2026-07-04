import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createGeometryPersister } from "./window-geometry";
import type { WindowGeometry } from "./index";

const geometry = (width: number, height: number): WindowGeometry => ({
  width,
  height,
  x: 0,
  y: 0,
});

describe("createGeometryPersister", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves the geometry once after the debounce window elapses", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persister = createGeometryPersister(save, 400);

    persister.schedule(geometry(1000, 700));
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(geometry(1000, 700));
  });

  it("coalesces a burst of changes into a single save of the latest", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persister = createGeometryPersister(save, 400);

    persister.schedule(geometry(1000, 700));
    vi.advanceTimersByTime(100);
    persister.schedule(geometry(1010, 710));
    vi.advanceTimersByTime(100);
    persister.schedule(geometry(1024, 768));
    vi.advanceTimersByTime(400);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(geometry(1024, 768));
  });

  it("flush writes the pending geometry immediately (force-quit path)", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persister = createGeometryPersister(save, 400);

    persister.schedule(geometry(1024, 768));
    persister.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(geometry(1024, 768));

    // The already-cleared timer must not fire a second save.
    vi.advanceTimersByTime(400);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending does not save", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persister = createGeometryPersister(save, 400);

    persister.flush();

    expect(save).not.toHaveBeenCalled();
  });

  it("cancel drops the pending save", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persister = createGeometryPersister(save, 400);

    persister.schedule(geometry(1024, 768));
    persister.cancel();
    vi.advanceTimersByTime(400);

    expect(save).not.toHaveBeenCalled();
  });

  it("swallows save rejections so a failed write never throws", () => {
    const save = vi.fn().mockRejectedValue(new Error("disk full"));
    const persister = createGeometryPersister(save, 400);

    persister.schedule(geometry(1024, 768));

    expect(() => vi.advanceTimersByTime(400)).not.toThrow();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
