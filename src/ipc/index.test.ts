import { describe, it, expect, vi, beforeEach } from "vitest";

// The real `invoke` talks to the Tauri webview bridge, which does not exist
// under Vitest/jsdom. Mock it so we can exercise the typed seam in isolation.
const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

// Imported after the mock is registered so the module binds to the mock.
import {
  ping,
  appVersion,
  saveWindowGeometry,
  loadWindowGeometry,
} from "./index";

describe("ipc bridge", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("ping forwards the message and returns the typed Pong", async () => {
    invoke.mockResolvedValue({ message: "pong: hi" });

    const result = await ping("hi");

    expect(invoke).toHaveBeenCalledWith("ping", { message: "hi" });
    expect(result).toEqual({ message: "pong: hi" });
  });

  it("appVersion invokes the command with no arguments", async () => {
    invoke.mockResolvedValue("0.1.0");

    const result = await appVersion();

    expect(invoke).toHaveBeenCalledWith("app_version");
    expect(result).toBe("0.1.0");
  });

  it("saveWindowGeometry forwards the geometry payload", async () => {
    invoke.mockResolvedValue(undefined);
    const geometry = { width: 1000, height: 700, x: 40, y: 25 };

    await saveWindowGeometry(geometry);

    expect(invoke).toHaveBeenCalledWith("save_window_geometry", { geometry });
  });

  it("loadWindowGeometry returns the typed geometry", async () => {
    const geometry = { width: 1200, height: 800, x: null, y: null };
    invoke.mockResolvedValue(geometry);

    const result = await loadWindowGeometry();

    expect(invoke).toHaveBeenCalledWith("load_window_geometry");
    expect(result).toEqual(geometry);
  });
});
