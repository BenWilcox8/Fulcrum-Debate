/**
 * Behavioural tests for the shorthand dictionary model: the abbreviation ->
 * expansion mapping and its local persistence.
 *
 * Uses `fake-indexeddb` (a fresh `IDBFactory()` per test, the same restart
 * pattern as the registry / preference-store tests) to prove a genuine
 * close/reopen round-trip - the acceptance criterion that the dictionary
 * persists locally and reloads intact.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SHORTHAND_ENTRIES,
  openShorthandDictionary,
  seedShorthandDictionary,
  type ShorthandDictionary,
} from "./dictionary";

let dicts: ShorthandDictionary[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  dicts = [];
});

afterEach(async () => {
  for (const dict of dicts) await dict.close();
});

async function open(): Promise<ShorthandDictionary> {
  const dict = openShorthandDictionary();
  dicts.push(dict);
  await dict.whenLoaded;
  return dict;
}

describe("shorthand dictionary model", () => {
  it("is empty on a fresh open", async () => {
    const dict = await open();
    expect(dict.entries()).toEqual([]);
    expect(dict.lookup("aff")).toBeUndefined();
  });

  it("stores and reads back an expansion by exact abbreviation", async () => {
    const dict = await open();
    dict.set("aff", "affirmative");
    expect(dict.lookup("aff")).toBe("affirmative");
  });

  it("matches exactly and case-sensitively - never a substring or wrong case", async () => {
    const dict = await open();
    dict.set("aff", "affirmative");
    expect(dict.lookup("affs")).toBeUndefined();
    expect(dict.lookup("af")).toBeUndefined();
    expect(dict.lookup("Aff")).toBeUndefined();
  });

  it("overwrites an existing abbreviation", async () => {
    const dict = await open();
    dict.set("cx", "cross-ex");
    dict.set("cx", "cross-examination");
    expect(dict.lookup("cx")).toBe("cross-examination");
  });

  it("removes an abbreviation and is safe on an absent one", async () => {
    const dict = await open();
    dict.set("fw", "framework");
    dict.remove("fw");
    expect(dict.lookup("fw")).toBeUndefined();
    expect(() => dict.remove("never-set")).not.toThrow();
  });

  it("lists entries sorted by abbreviation", async () => {
    const dict = await open();
    dict.set("neg", "negative");
    dict.set("aff", "affirmative");
    dict.set("cx", "cross-examination");
    expect(dict.entries()).toEqual([
      { abbreviation: "aff", expansion: "affirmative" },
      { abbreviation: "cx", expansion: "cross-examination" },
      { abbreviation: "neg", expansion: "negative" },
    ]);
  });

  it("rejects an empty abbreviation or expansion", async () => {
    const dict = await open();
    expect(() => dict.set("", "something")).toThrow();
    expect(() => dict.set("aff", "")).toThrow();
  });

  it("notifies subscribers on set and remove", async () => {
    const dict = await open();
    let count = 0;
    const unsubscribe = dict.subscribe(() => {
      count += 1;
    });
    dict.set("aff", "affirmative");
    dict.remove("aff");
    expect(count).toBe(2);
    unsubscribe();
    dict.set("neg", "negative");
    expect(count).toBe(2);
  });

  it("persists entries across a close/reopen over the same backend", async () => {
    const first = await open();
    first.set("aff", "affirmative");
    first.set("cx", "cross-examination");
    await first.close();

    const reopened = await open();
    expect(reopened.lookup("aff")).toBe("affirmative");
    expect(reopened.lookup("cx")).toBe("cross-examination");
    expect(reopened.entries()).toHaveLength(2);
  });

  it("persists a removal across a reopen", async () => {
    const first = await open();
    first.set("aff", "affirmative");
    first.set("neg", "negative");
    first.remove("aff");
    await first.close();

    const reopened = await open();
    expect(reopened.lookup("aff")).toBeUndefined();
    expect(reopened.lookup("neg")).toBe("negative");
  });
});

describe("seed fixtures", () => {
  it("seeds the default entries into an empty dictionary", async () => {
    const dict = await open();
    seedShorthandDictionary(dict);
    for (const { abbreviation, expansion } of DEFAULT_SHORTHAND_ENTRIES) {
      expect(dict.lookup(abbreviation)).toBe(expansion);
    }
  });

  it("is idempotent and never clobbers an existing user entry", async () => {
    const dict = await open();
    dict.set("aff", "my custom aff");
    seedShorthandDictionary(dict);
    // The user's value is preserved...
    expect(dict.lookup("aff")).toBe("my custom aff");
    // ...while other defaults still seed.
    expect(dict.lookup("neg")).toBe("negative");
  });

  it("seeds an explicit fixture set", async () => {
    const dict = await open();
    seedShorthandDictionary(dict, [{ abbreviation: "t", expansion: "topicality" }]);
    expect(dict.lookup("t")).toBe("topicality");
    expect(dict.entries()).toHaveLength(1);
  });
});
