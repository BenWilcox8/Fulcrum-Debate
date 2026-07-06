// jsdom ships no IndexedDB; install the in-memory fake before the store reads
// the global - the same pattern the preference-store persistence tests use.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { createPreferenceStore, openPreferenceStore } from "../preferences";
import {
  DEFAULT_FORMATTING_PROFILE,
  FORMATTING_TARGET_KEYS,
} from "./profile";
import {
  FORMATTING_SECTION_ID,
  registerFormattingSection,
  readFormattingProfile,
} from "./preferences";

/**
 * These tests assert observable behaviour of the formatting section over the
 * public preference-store seam: defaults equal the standards, values are
 * editable per entry, reset restores the standards, and a set value survives a
 * store restart over the same local backend. They never reach into Yjs or
 * IndexedDB internals.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("formatting preferences section registration", () => {
  it("registers under the well-known formatting id", () => {
    const store = createPreferenceStore();
    const handle = registerFormattingSection(store);

    expect(handle.id).toBe(FORMATTING_SECTION_ID);
    expect(store.listSections().map((d) => d.id)).toContain(
      FORMATTING_SECTION_ID,
    );
  });

  it("exposes the standards as the section defaults", () => {
    const store = createPreferenceStore();
    const handle = registerFormattingSection(store);

    expect(handle.getAll()).toEqual(DEFAULT_FORMATTING_PROFILE);
    expect(readFormattingProfile(handle)).toEqual(DEFAULT_FORMATTING_PROFILE);
  });

  it("is self-describing: every target field carries a label for the settings UI", () => {
    const store = createPreferenceStore();
    const handle = registerFormattingSection(store);
    const { fields, title } = handle.definition;

    expect(title).toBeTruthy();
    for (const key of FORMATTING_TARGET_KEYS) {
      expect(fields[key]).toBeDefined();
      expect(fields[key].label).toBeTruthy();
    }
  });

  it("re-registration is idempotent and preserves already-set values", () => {
    const store = createPreferenceStore();
    const first = registerFormattingSection(store);
    first.set("body", {
      ...DEFAULT_FORMATTING_PROFILE.body,
      fontSize: "10pt",
    });

    const second = registerFormattingSection(store);
    expect(second).toBe(first);
    expect(second.get("body").fontSize).toBe("10pt");
  });
});

describe("editing and resetting formatting values", () => {
  it("edits one entry's font/size/color without touching the others", () => {
    const store = createPreferenceStore();
    const handle = registerFormattingSection(store);

    handle.set("tag", {
      fontFamily: "Georgia",
      fontSize: "14pt",
      color: "#112233",
      bold: false,
      underline: true,
    });

    expect(handle.get("tag")).toEqual({
      fontFamily: "Georgia",
      fontSize: "14pt",
      color: "#112233",
      bold: false,
      underline: true,
    });
    // Every other entry is still its standard default.
    expect(handle.get("body")).toEqual(DEFAULT_FORMATTING_PROFILE.body);
    expect(handle.get("cite")).toEqual(DEFAULT_FORMATTING_PROFILE.cite);
  });

  it("reset restores the standards", () => {
    const store = createPreferenceStore();
    const handle = registerFormattingSection(store);

    handle.set("highlight", {
      ...DEFAULT_FORMATTING_PROFILE.highlight,
      color: "#ff0000",
      underline: false,
    });
    expect(handle.get("highlight")).not.toEqual(
      DEFAULT_FORMATTING_PROFILE.highlight,
    );

    handle.reset();
    expect(handle.getAll()).toEqual(DEFAULT_FORMATTING_PROFILE);
  });
});

describe("formatting values persist across a store restart", () => {
  it("a set entry survives; unset entries still resolve to the standards", async () => {
    const first = openPreferenceStore();
    await first.whenLoaded;
    const a = registerFormattingSection(first);
    a.set("body", { ...DEFAULT_FORMATTING_PROFILE.body, fontSize: "10pt" });
    await first.close();

    const second = openPreferenceStore();
    const b = registerFormattingSection(second);
    await second.whenLoaded;
    try {
      expect(b.get("body").fontSize).toBe("10pt"); // persisted override
      expect(b.get("tag")).toEqual(DEFAULT_FORMATTING_PROFILE.tag); // never set
    } finally {
      await second.close();
    }
  });

  it("a reset section forgets its overrides across a restart", async () => {
    const first = openPreferenceStore();
    await first.whenLoaded;
    const a = registerFormattingSection(first);
    a.set("body", { ...DEFAULT_FORMATTING_PROFILE.body, fontSize: "10pt" });
    a.reset();
    await first.close();

    const second = openPreferenceStore();
    const b = registerFormattingSection(second);
    await second.whenLoaded;
    try {
      expect(b.getAll()).toEqual(DEFAULT_FORMATTING_PROFILE);
    } finally {
      await second.close();
    }
  });
});
