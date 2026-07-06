// The React binding over the active-speech-doc store: pure in-memory, no
// IndexedDB. Proves the reactive read/write and provider sharing that pipeline
// surfaces will consume.
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";

import { createActiveSpeechDocStore } from "./active-speech-doc";
import { ActiveSpeechDocProvider } from "./ActiveSpeechDocProvider";
import {
  useActiveSpeechDoc,
  useActiveSpeechDocStore,
} from "./active-speech-doc-context";

/** Reads the active id reactively and offers a button to set it. */
function ActiveProbe() {
  const { activeId, setActiveId } = useActiveSpeechDoc();
  return (
    <div>
      <span data-testid="active">{activeId ?? "none"}</span>
      <button type="button" onClick={() => setActiveId("speech-x")}>
        activate
      </button>
    </div>
  );
}

describe("useActiveSpeechDoc", () => {
  it("re-renders when the active id changes on the shared store", () => {
    const store = createActiveSpeechDocStore();
    render(
      <ActiveSpeechDocProvider store={store}>
        <ActiveProbe />
      </ActiveSpeechDocProvider>,
    );

    expect(screen.getByTestId("active")).toHaveTextContent("none");

    // A change made directly on the model store (as a pipeline / editor would)
    // is observed live by the React consumer.
    act(() => {
      store.setActiveId("speech-7");
    });
    expect(screen.getByTestId("active")).toHaveTextContent("speech-7");
  });

  it("writes back through the hook's setter", () => {
    const store = createActiveSpeechDocStore();
    render(
      <ActiveSpeechDocProvider store={store}>
        <ActiveProbe />
      </ActiveSpeechDocProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: /activate/i }).click();
    });
    expect(screen.getByTestId("active")).toHaveTextContent("speech-x");
    expect(store.getActiveId()).toBe("speech-x");
  });

  it("shares one store across consumers under a provider", () => {
    const store = createActiveSpeechDocStore();
    function Setter() {
      const s = useActiveSpeechDocStore();
      return (
        <button type="button" onClick={() => s.setActiveId("speech-shared")}>
          set
        </button>
      );
    }
    render(
      <ActiveSpeechDocProvider store={store}>
        <Setter />
        <ActiveProbe />
      </ActiveSpeechDocProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: /^set$/i }).click();
    });
    expect(screen.getByTestId("active")).toHaveTextContent("speech-shared");
  });

  it("is provider-tolerant: works with no provider (fallback store)", () => {
    // No ActiveSpeechDocProvider - the hook falls back to a private store rather
    // than throwing, so a bare subtree still renders.
    render(<ActiveProbe />);
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    act(() => {
      screen.getByRole("button", { name: /activate/i }).click();
    });
    expect(screen.getByTestId("active")).toHaveTextContent("speech-x");
  });
});
