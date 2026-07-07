import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  getPreferences,
  setPreferences,
  openExternal,
  uploadToSpeechDrop,
  isTauriAvailable,
  DEFAULT_PREFERENCES,
} from "./index";

const TAURI = "__TAURI_INTERNALS__";

describe("ipc bridge", () => {
  beforeEach(() => {
    invoke.mockReset();
    // The hand-off commands guard on the Tauri IPC bridge being present; simulate
    // running inside the desktop shell so the wrappers reach `invoke`.
    (window as unknown as Record<string, unknown>)[TAURI] = {};
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[TAURI];
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

  it("DEFAULT_PREFERENCES seeds the light theme", () => {
    expect(DEFAULT_PREFERENCES).toEqual({ theme: "light" });
  });

  it("getPreferences reads through the get_preferences command", async () => {
    invoke.mockResolvedValue({ theme: "dark" });

    const result = await getPreferences();

    expect(invoke).toHaveBeenCalledWith("get_preferences");
    expect(result).toEqual({ theme: "dark" });
  });

  it("setPreferences forwards the preferences and returns what was saved", async () => {
    invoke.mockResolvedValue({ theme: "dark" });

    const result = await setPreferences({ theme: "dark" });

    expect(invoke).toHaveBeenCalledWith("set_preferences", {
      preferences: { theme: "dark" },
    });
    expect(result).toEqual({ theme: "dark" });
  });

  it("openExternal forwards the url to the open_external command", async () => {
    invoke.mockResolvedValue(undefined);

    await openExternal("mailto:?subject=Hi");

    expect(invoke).toHaveBeenCalledWith("open_external", {
      url: "mailto:?subject=Hi",
    });
  });

  it("uploadToSpeechDrop forwards the request to the speechdrop_upload command", async () => {
    invoke.mockResolvedValue(undefined);
    const request = {
      roomCode: "aB3dEf",
      fileName: "Speech.rtf",
      contentType: "text/rtf",
      contentBase64: "e30=",
    };

    await uploadToSpeechDrop(request);

    expect(invoke).toHaveBeenCalledWith("speechdrop_upload", { request });
  });

  it("uploadToSpeechDrop rejects with the Rust-side failure message", async () => {
    invoke.mockRejectedValue("That SpeechDrop room code wasn't found.");
    await expect(
      uploadToSpeechDrop({
        roomCode: "zzz999",
        fileName: "Speech.rtf",
        contentType: "text/rtf",
        contentBase64: "e30=",
      }),
    ).rejects.toBe("That SpeechDrop room code wasn't found.");
  });

  it("openExternal rejects when the Rust opener fails", async () => {
    invoke.mockRejectedValue("no opener");

    await expect(openExternal("mailto:")).rejects.toBe("no opener");
  });

  describe("without the Tauri IPC bridge (plain browser)", () => {
    beforeEach(() => {
      delete (window as unknown as Record<string, unknown>)[TAURI];
    });

    it("isTauriAvailable reports false", () => {
      expect(isTauriAvailable()).toBe(false);
    });

    it("openExternal rejects with a friendly reason and never calls invoke", async () => {
      const rejection = await openExternal("mailto:?subject=Hi").catch(
        (e: unknown) => e,
      );

      expect(invoke).not.toHaveBeenCalled();
      expect(rejection).toBeInstanceOf(Error);
      const message = (rejection as Error).message;
      // A readable, user-facing reason - never the raw `invoke` TypeError.
      expect(message).toMatch(/desktop app/i);
      expect(message).not.toMatch(/invoke|undefined|reading/i);
    });

    it("uploadToSpeechDrop rejects with a friendly reason and never calls invoke", async () => {
      const rejection = await uploadToSpeechDrop({
        roomCode: "aB3dEf",
        fileName: "Speech.rtf",
        contentType: "text/rtf",
        contentBase64: "e30=",
      }).catch((e: unknown) => e);

      expect(invoke).not.toHaveBeenCalled();
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toMatch(/desktop app/i);
      expect((rejection as Error).message).not.toMatch(
        /invoke|undefined|reading/i,
      );
    });
  });

  it("isTauriAvailable reports true when the bridge is present", () => {
    expect(isTauriAvailable()).toBe(true);
  });
});
