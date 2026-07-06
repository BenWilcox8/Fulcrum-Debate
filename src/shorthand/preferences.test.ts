// jsdom ships no IndexedDB; install the in-memory fake before the store reads
// the global - the same pattern the formatting/preference-store tests use.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { createPreferenceStore, openPreferenceStore } from "../preferences";
import { DEFAULT_SHORTHAND_SCOPE, SHORTHAND_SCOPES } from "./scope";
import {
  SHORTHAND_SCOPE_KEY,
  SHORTHAND_SECTION_ID,
  readShorthandScope,
  registerShorthandSection,
} from "./preferences";

/**
 * Behaviour of the shorthand section over the public preference-store seam: it
 * registers under a well-known id, defaults to the natural scope, exposes the
 * scope choices for the settings UI, is editable + resettable, and a set scope
 * survives a store restart over the same local backend.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("shorthand preferences section", () => {
  it("registers under the well-known shorthand id", () => {
    const store = createPreferenceStore();
    const handle = registerShorthandSection(store);

    expect(handle.id).toBe(SHORTHAND_SECTION_ID);
    expect(store.listSections().map((d) => d.id)).toContain(
      SHORTHAND_SECTION_ID,
    );
  });

  it("defaults to the natural scope ('both')", () => {
    const store = createPreferenceStore();
    const handle = registerShorthandSection(store);

    expect(readShorthandScope(handle)).toBe(DEFAULT_SHORTHAND_SCOPE);
    expect(handle.get(SHORTHAND_SCOPE_KEY)).toBe("both");
  });

  it("is self-describing: the scope field carries a label and the scope options", () => {
    const store = createPreferenceStore();
    const handle = registerShorthandSection(store);
    const field = handle.definition.fields[SHORTHAND_SCOPE_KEY];

    expect(handle.definition.title).toBeTruthy();
    expect(field.label).toBeTruthy();
    expect(field.options).toEqual(SHORTHAND_SCOPES);
  });

  it("is editable and resettable", () => {
    const store = createPreferenceStore();
    const handle = registerShorthandSection(store);

    handle.set(SHORTHAND_SCOPE_KEY, "neither");
    expect(readShorthandScope(handle)).toBe("neither");

    handle.reset();
    expect(readShorthandScope(handle)).toBe(DEFAULT_SHORTHAND_SCOPE);
  });

  it("is idempotent to re-register, preserving a set scope", () => {
    const store = createPreferenceStore();
    const first = registerShorthandSection(store);
    first.set(SHORTHAND_SCOPE_KEY, "flow");

    const second = registerShorthandSection(store);
    expect(readShorthandScope(second)).toBe("flow");
  });

  it("persists a set scope across a store restart; unset resolves to the default", async () => {
    const first = openPreferenceStore();
    await first.whenLoaded;
    const a = registerShorthandSection(first);
    a.set(SHORTHAND_SCOPE_KEY, "speech");
    await first.close();

    const second = openPreferenceStore();
    const b = registerShorthandSection(second);
    await second.whenLoaded;
    try {
      expect(readShorthandScope(b)).toBe("speech");
    } finally {
      await second.close();
    }

    const third = openPreferenceStore();
    await third.whenLoaded;
    const c = registerShorthandSection(third);
    c.reset();
    await third.close();

    const fourth = openPreferenceStore();
    const d = registerShorthandSection(fourth);
    await fourth.whenLoaded;
    try {
      expect(readShorthandScope(d)).toBe(DEFAULT_SHORTHAND_SCOPE);
    } finally {
      await fourth.close();
    }
  });
});
