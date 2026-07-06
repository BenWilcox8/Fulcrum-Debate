// The active-speech-doc store is pure in-memory model state (no IndexedDB, no
// React), so these tests drive the core directly. It is the key shared surface
// content pipelines target, so its identify/set/observe contract is pinned here.
import { describe, it, expect, vi } from "vitest";

import { createActiveSpeechDocStore } from "./active-speech-doc";

describe("active-speech-doc store", () => {
  it("starts with no active speech doc", () => {
    const store = createActiveSpeechDocStore();
    expect(store.getActiveId()).toBeNull();
  });

  it("identifies the active speech doc by its document id", () => {
    const store = createActiveSpeechDocStore();
    store.setActiveId("speech-42");
    expect(store.getActiveId()).toBe("speech-42");
  });

  it("clears the active speech doc with null", () => {
    const store = createActiveSpeechDocStore();
    store.setActiveId("speech-42");
    store.setActiveId(null);
    expect(store.getActiveId()).toBeNull();
  });

  it("notifies subscribers on a real change", () => {
    const store = createActiveSpeechDocStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setActiveId("speech-1");
    expect(listener).toHaveBeenCalledTimes(1);
    store.setActiveId("speech-2");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not notify when the id is unchanged (stable snapshot)", () => {
    const store = createActiveSpeechDocStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setActiveId("speech-1");
    store.setActiveId("speech-1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not fire immediately on subscribe", () => {
    const store = createActiveSpeechDocStore();
    store.setActiveId("speech-1");
    const listener = vi.fn();
    store.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const store = createActiveSpeechDocStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setActiveId("speech-1");
    unsubscribe();
    store.setActiveId("speech-2");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("isolates two stores - one's active id never affects the other", () => {
    const a = createActiveSpeechDocStore();
    const b = createActiveSpeechDocStore();
    a.setActiveId("speech-a");
    expect(b.getActiveId()).toBeNull();
  });
});
