// jsdom ships no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern the document core and registry tests use.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { openPreferenceStore } from "./persistence";
import type { SectionDefinition } from "./types";

/**
 * These tests assert observable *behavior* - that a value set in one store
 * instance is read back by a fresh instance opened over the same local backend,
 * that unset keys still resolve to defaults, and that boot touches no network -
 * never IndexedDB or Yjs internals.
 *
 * A fresh IndexedDB backend per test keeps them isolated; reopening within a
 * test hits the same backend on purpose - that is what the restart tests
 * exercise. The store always binds the same well-known database name.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/**
 * A representative feature section. `as const` is omitted so the boolean/string
 * defaults widen, letting a test `set` the other value (the convention the core
 * tests follow).
 */
function formattingSection() {
  return {
    id: "formatting",
    title: "Formatting",
    fields: {
      fontSize: { default: "11pt", options: ["10pt", "11pt", "12pt"] },
      autoShrink: { default: true },
      maxLines: { default: 8 },
    },
  } satisfies SectionDefinition;
}

describe("openPreferenceStore (local persistence)", () => {
  it("registers, reads defaults, and lists like the core store", async () => {
    const store = openPreferenceStore();
    try {
      const section = store.registerSection(formattingSection());
      expect(section.get("fontSize")).toBe("11pt");
      expect(store.listSections().map((d) => d.id)).toEqual(["formatting"]);
    } finally {
      await store.close();
    }
  });

  it("persists a set value across a store restart over the same backend", async () => {
    const first = openPreferenceStore();
    await first.whenLoaded;
    const a = first.registerSection(formattingSection());
    a.set("fontSize", "12pt");
    a.set("autoShrink", false);
    // Let the debounced/async local write settle before tearing down.
    await first.close();

    const second = openPreferenceStore();
    const b = second.registerSection(formattingSection());
    await second.whenLoaded;
    try {
      expect(b.get("fontSize")).toBe("12pt");
      expect(b.get("autoShrink")).toBe(false);
    } finally {
      await second.close();
    }
  });

  it("resolves unset keys to their registered default after a restart", async () => {
    const first = openPreferenceStore();
    await first.whenLoaded;
    const a = first.registerSection(formattingSection());
    a.set("fontSize", "10pt"); // only this key is ever set
    await first.close();

    const second = openPreferenceStore();
    const b = second.registerSection(formattingSection());
    await second.whenLoaded;
    try {
      expect(b.get("fontSize")).toBe("10pt"); // persisted override
      expect(b.get("autoShrink")).toBe(true); // never set -> default
      expect(b.get("maxLines")).toBe(8); // never set -> default
    } finally {
      await second.close();
    }
  });

  it("persists object-valued preferences without sharing mutable state", async () => {
    const objectSection = {
      id: "layout",
      fields: { margins: { default: { top: 1, bottom: 1 } } },
    } satisfies SectionDefinition;

    const first = openPreferenceStore();
    await first.whenLoaded;
    const a = first.registerSection(objectSection);
    a.set("margins", { top: 2, bottom: 3 });
    await first.close();

    const second = openPreferenceStore();
    const b = second.registerSection(objectSection);
    await second.whenLoaded;
    try {
      expect(b.get("margins")).toEqual({ top: 2, bottom: 3 });
    } finally {
      await second.close();
    }
  });

  it("forgets a reset section's overrides across a restart", async () => {
    const first = openPreferenceStore();
    await first.whenLoaded;
    const a = first.registerSection(formattingSection());
    a.set("fontSize", "12pt");
    a.reset();
    await first.close();

    const second = openPreferenceStore();
    const b = second.registerSection(formattingSection());
    await second.whenLoaded;
    try {
      expect(b.get("fontSize")).toBe("11pt"); // back to default
    } finally {
      await second.close();
    }
  });

  it("does not clobber a value set during the load gap", async () => {
    // Seed a stored override.
    const seed = openPreferenceStore();
    await seed.whenLoaded;
    seed.registerSection(formattingSection()).set("fontSize", "12pt");
    await seed.close();

    // A fresh store: register and set BEFORE the local load resolves.
    const store = openPreferenceStore();
    const s = store.registerSection(formattingSection());
    s.set("fontSize", "10pt");
    await store.whenLoaded;
    try {
      // Hydration must not overwrite the user's in-flight choice.
      expect(s.get("fontSize")).toBe("10pt");
    } finally {
      await store.close();
    }
  });
});

describe("openPreferenceStore is local-first (offline)", () => {
  const NETWORK_GLOBALS = [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
  ] as const;
  const saved = new Map<string, unknown>();

  beforeEach(() => {
    for (const name of NETWORK_GLOBALS) {
      saved.set(name, (globalThis as Record<string, unknown>)[name]);
      (globalThis as Record<string, unknown>)[name] = () => {
        throw new Error(`local-first violation: preferences touched ${name}()`);
      };
    }
  });

  afterEach(() => {
    for (const name of NETWORK_GLOBALS) {
      (globalThis as Record<string, unknown>)[name] = saved.get(name);
    }
    saved.clear();
  });

  it("opens, hydrates, and persists with every network transport stubbed to fail", async () => {
    const store = openPreferenceStore();
    const section = store.registerSection(formattingSection());
    await store.whenLoaded;
    section.set("fontSize", "12pt");
    expect(section.get("fontSize")).toBe("12pt");
    await store.close();
  });
});
