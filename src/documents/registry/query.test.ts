// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern the registry's own tests use.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openRegistry, type DocumentRegistry } from "./registry";
import { recentDocuments } from "./query";

/**
 * These tests assert observable *behavior* of the recent-documents query - the
 * order it returns, that kind filtering narrows the set, and that it reads
 * synchronously from the local registry - never IndexedDB or Yjs internals. It
 * uses a real registry over a fresh fake-indexeddb backend, matching the
 * registry's own test setup.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Seeds a loaded registry with the given entries and returns it. */
async function seededRegistry(): Promise<DocumentRegistry> {
  const registry = openRegistry();
  await registry.whenLoaded;
  registry.add({ id: "flow-old", kind: "flow-sheet", title: "R1", createdAt: 100 });
  registry.add({ id: "speech-mid", kind: "speech-doc", title: "1AC", createdAt: 200 });
  registry.add({ id: "block-new", kind: "block-file", title: "Blocks", createdAt: 300 });
  return registry;
}

describe("recentDocuments", () => {
  it("returns documents ordered by last-edited, most recent first", async () => {
    const registry = await seededRegistry();

    // lastEditedAt defaults to createdAt, so newest-created leads.
    expect(recentDocuments(registry).map((e) => e.id)).toEqual([
      "block-new",
      "speech-mid",
      "flow-old",
    ]);

    // Editing the oldest floats it to the top of the recency order.
    registry.touch("flow-old", 400);
    expect(recentDocuments(registry).map((e) => e.id)).toEqual([
      "flow-old",
      "block-new",
      "speech-mid",
    ]);

    await registry.close();
  });

  it("filters by a single kind, preserving recency order", async () => {
    const registry = await seededRegistry();
    registry.add({ id: "flow-new", kind: "flow-sheet", title: "R2", createdAt: 500 });

    expect(recentDocuments(registry, { kind: "flow-sheet" }).map((e) => e.id)).toEqual([
      "flow-new",
      "flow-old",
    ]);

    await registry.close();
  });

  it("filters by several kinds at once", async () => {
    const registry = await seededRegistry();

    // Flow sheets and block files, but not speech docs.
    const ids = recentDocuments(registry, {
      kind: ["flow-sheet", "block-file"],
    }).map((e) => e.id);
    expect(ids).toEqual(["block-new", "flow-old"]);

    await registry.close();
  });

  it("returns every kind when no filter is given", async () => {
    const registry = await seededRegistry();

    expect(recentDocuments(registry)).toHaveLength(3);

    await registry.close();
  });

  it("caps the result at a limit, keeping the most recent", async () => {
    const registry = await seededRegistry();

    expect(recentDocuments(registry, { limit: 2 }).map((e) => e.id)).toEqual([
      "block-new",
      "speech-mid",
    ]);

    await registry.close();
  });

  it("combines a kind filter with a limit", async () => {
    const registry = await seededRegistry();
    registry.add({ id: "flow-new", kind: "flow-sheet", title: "R2", createdAt: 500 });

    expect(
      recentDocuments(registry, { kind: "flow-sheet", limit: 1 }).map((e) => e.id),
    ).toEqual(["flow-new"]);

    await registry.close();
  });

  it("returns an empty array for an empty registry", async () => {
    const registry = openRegistry();
    await registry.whenLoaded;

    expect(recentDocuments(registry)).toEqual([]);
    expect(recentDocuments(registry, { kind: "flow-sheet" })).toEqual([]);

    await registry.close();
  });

  it("reads synchronously - returns an array, not a promise", async () => {
    const registry = await seededRegistry();

    const result = recentDocuments(registry);
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toBeInstanceOf(Promise);

    await registry.close();
  });

  it("reads through the list() seam only - works on any list source", () => {
    // The query depends on nothing but a synchronous list(), so a plain stub
    // (no IndexedDB) drives it just as well - proof it is a pure data seam.
    const stub = {
      list: () => [
        { id: "a", kind: "flow-sheet" as const, title: "A", createdAt: 2, lastEditedAt: 2 },
        { id: "b", kind: "block-file" as const, title: "B", createdAt: 1, lastEditedAt: 1 },
      ],
    };

    expect(recentDocuments(stub, { kind: "block-file" }).map((e) => e.id)).toEqual(["b"]);
  });
});
