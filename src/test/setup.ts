import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom ships no ResizeObserver, but XYFlow (and the flow-sheet canvas) observe
// element size. Install a no-op stub so components that measure the DOM mount
// without throwing; canvas tests assert structure/behaviour, never pixels, so a
// stub that never fires is sufficient.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

// Unmount React trees between tests so they stay isolated.
afterEach(() => {
  cleanup();
});
