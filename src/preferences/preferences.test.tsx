import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// The IPC layer talks to the Tauri webview bridge, which does not exist under
// Vitest/jsdom (per AGENTS.md). Mock the seam so the provider is exercised in
// isolation against controllable command behaviour.
const getPreferences = vi.fn();
const setPreferences = vi.fn();
vi.mock("../ipc", async () => {
  const actual = await vi.importActual<typeof import("../ipc")>("../ipc");
  return {
    ...actual,
    getPreferences: () => getPreferences(),
    setPreferences: (prefs: unknown) => setPreferences(prefs),
  };
});

import { PreferencesProvider } from "./PreferencesProvider";
import { usePreferences } from "./usePreferences";

/** Renders the current theme and a button that flips it to dark and persists. */
function Consumer() {
  const { preferences, loading, updatePreferences } = usePreferences();
  return (
    <div>
      <span data-testid="theme">{preferences.theme}</span>
      <span data-testid="loading">{String(loading)}</span>
      <button onClick={() => void updatePreferences({ theme: "dark" })}>
        go dark
      </button>
    </div>
  );
}

describe("PreferencesProvider", () => {
  beforeEach(() => {
    getPreferences.mockReset();
    setPreferences.mockReset();
  });

  it("renders typed defaults synchronously before the store resolves", () => {
    // A never-resolving read models the pre-load window.
    getPreferences.mockReturnValue(new Promise(() => {}));

    render(
      <PreferencesProvider>
        <Consumer />
      </PreferencesProvider>,
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
  });

  it("folds in the persisted preferences once the store read resolves", async () => {
    getPreferences.mockResolvedValue({ theme: "dark" });

    render(
      <PreferencesProvider>
        <Consumer />
      </PreferencesProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("theme")).toHaveTextContent("dark"),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  it("keeps defaults when the store read rejects (broken environment)", async () => {
    getPreferences.mockRejectedValue(new Error("bridge unavailable"));

    render(
      <PreferencesProvider>
        <Consumer />
      </PreferencesProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("persists updates through the seam and reflects the saved value", async () => {
    getPreferences.mockResolvedValue({ theme: "light" });
    // The Rust side echoes back what it saved; model that here.
    setPreferences.mockImplementation((prefs) => Promise.resolve(prefs));

    render(
      <PreferencesProvider>
        <Consumer />
      </PreferencesProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );

    await act(async () => {
      screen.getByRole("button", { name: /go dark/i }).click();
    });

    expect(setPreferences).toHaveBeenCalledWith({ theme: "dark" });
    await waitFor(() =>
      expect(screen.getByTestId("theme")).toHaveTextContent("dark"),
    );
  });
});

describe("usePreferences", () => {
  it("throws when used outside a provider", () => {
    // Silence the expected React error boundary logging for this case.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Orphan() {
      usePreferences();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(
      /must be used within a PreferencesProvider/,
    );
    spy.mockRestore();
  });
});
