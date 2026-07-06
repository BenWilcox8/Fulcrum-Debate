import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom does not implement getClientRects on Range or Text nodes; ProseMirror's
// singleRect (called via scrollToSelection / scrollIntoView / focus) wraps text
// nodes in a Range via textRange() then calls range.getClientRects() - crash.
// Stub Range first (the common path), then Text as a safety net for any direct
// call path. Return one zero rect so singleRect doesn't fall through to
// getBoundingClientRect (also missing on Range in jsdom).
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  const zeroRect = (): DOMRect =>
    ({
      top: 0, bottom: 0, left: 0, right: 0,
      width: 0, height: 0, x: 0, y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Range.prototype.getClientRects = function (): DOMRectList {
    const r = zeroRect();
    return Object.assign([r], { item: (i: number) => (i === 0 ? r : null) }) as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return zeroRect();
  };
}
// Text is not typed with getClientRects in the DOM lib (it's an Element/Range
// method), so cast through unknown to assign the stub without a TS error.
type WithGetClientRects = { getClientRects?: () => DOMRectList };
if (typeof Text !== "undefined" && !(Text.prototype as unknown as WithGetClientRects).getClientRects) {
  (Text.prototype as unknown as WithGetClientRects).getClientRects = function (): DOMRectList {
    return Object.assign([], { item: () => null }) as unknown as DOMRectList;
  };
}

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
