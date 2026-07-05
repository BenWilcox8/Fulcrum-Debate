// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern the document core's tests use.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openRegistry, type DocumentRegistry } from "./registry";
import { openDocument } from "../core";

/**
 * These tests assert observable *behavior* - what listings return, that state
 * survives a fresh registry instance over the same store, that edits bump
 * ordering - never IndexedDB or Yjs internals.
 */

// A fresh IndexedDB backend per test so nothing leaks between tests. Reopening
// within a test still hits the same backend - the point of the restart tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `doc-${Date.now()}-${nextId++}`;

describe("entries", () => {
  it("carries id, kind, title, created and last-edited timestamps", async () => {
    const registry = openRegistry();
    await registry.whenLoaded;

    const id = uniqueId();
    const entry = registry.add({
      id,
      kind: "flow-sheet",
      title: "R1 vs Westside",
      createdAt: 1000,
    });

    expect(entry).toEqual({
      id,
      kind: "flow-sheet",
      title: "R1 vs Westside",
      createdAt: 1000,
      // lastEditedAt defaults to createdAt for a freshly created document.
      lastEditedAt: 1000,
    });
    expect(registry.get(id)).toEqual(entry);

    await registry.close();
  });

  it("rejects an empty id and a duplicate id", async () => {
    const registry = openRegistry();
    await registry.whenLoaded;

    expect(() => registry.add({ id: "", kind: "speech-doc", title: "x" })).toThrow(
      /non-empty/,
    );

    const id = uniqueId();
    registry.add({ id, kind: "speech-doc", title: "first" });
    expect(() => registry.add({ id, kind: "speech-doc", title: "again" })).toThrow(
      /already registered/,
    );

    await registry.close();
  });
});

describe("listing order", () => {
  it("returns entries by last-edited, most recent first", async () => {
    const registry = openRegistry();
    await registry.whenLoaded;

    const a = uniqueId();
    const b = uniqueId();
    const c = uniqueId();
    registry.add({ id: a, kind: "flow-sheet", title: "A", createdAt: 100 });
    registry.add({ id: b, kind: "speech-doc", title: "B", createdAt: 200 });
    registry.add({ id: c, kind: "block-file", title: "C", createdAt: 300 });

    // Newest creation first, since lastEditedAt defaults to createdAt.
    expect(registry.list().map((e) => e.id)).toEqual([c, b, a]);

    // An edit to the oldest floats it to the top.
    registry.touch(a, 400);
    expect(registry.list().map((e) => e.id)).toEqual([a, c, b]);

    await registry.close();
  });
});

describe("add / rename / remove are observable", () => {
  it("reflects operations in list() and notifies subscribers", async () => {
    const registry = openRegistry();
    await registry.whenLoaded;

    let notifications = 0;
    const unsubscribe = registry.subscribe(() => {
      notifications += 1;
    });

    const id = uniqueId();
    registry.add({ id, kind: "flow-sheet", title: "Draft", createdAt: 500 });
    expect(registry.list().map((e) => e.title)).toEqual(["Draft"]);

    const renamed = registry.updateTitle(id, "Final", 600);
    expect(renamed.title).toBe("Final");
    // Rename is a user-visible change, so it bumps last-edited.
    expect(renamed.lastEditedAt).toBe(600);
    expect(registry.get(id)?.title).toBe("Final");

    registry.remove(id);
    expect(registry.list()).toEqual([]);
    expect(registry.get(id)).toBeUndefined();

    expect(notifications).toBeGreaterThanOrEqual(3);
    unsubscribe();

    await registry.close();
  });
});

describe("last-edited via track()", () => {
  it("bumps last-edited when a tracked document's content changes", async () => {
    const registry = openRegistry();
    await registry.whenLoaded;

    const id = uniqueId();
    registry.add({ id, kind: "speech-doc", title: "1AC", createdAt: 1 });

    const handle = openDocument({ id, kind: "speech-doc" });
    await handle.whenLoaded;
    const untrack = registry.track(handle);

    const before = registry.get(id)!.lastEditedAt;
    handle.doc.getText("body").insert(0, "contention one");
    const after = registry.get(id)!.lastEditedAt;

    expect(after).toBeGreaterThan(before);

    untrack();
    await handle.close();
    await registry.close();
  });

  it("does not treat opening a stored document as an edit", async () => {
    const id = uniqueId();

    // Seed some persisted content in the document's own store first.
    const seed = openDocument({ id, kind: "block-file" });
    await seed.whenLoaded;
    seed.doc.getArray<string>("cards").push(["card-a"]);
    await seed.close();

    const registry = openRegistry();
    await registry.whenLoaded;
    registry.add({ id, kind: "block-file", title: "Blocks", createdAt: 10, lastEditedAt: 10 });

    // Reopening replays stored updates via y-indexeddb; tracking must ignore them.
    const handle = openDocument({ id, kind: "block-file" });
    registry.track(handle);
    await handle.whenLoaded;
    // Let any post-load microtasks settle.
    await Promise.resolve();

    expect(registry.get(id)!.lastEditedAt).toBe(10);

    await handle.close();
    await registry.close();
  });
});

describe("persistence across store instances", () => {
  it("survives a simulated restart over the same backend", async () => {
    const a = uniqueId();
    const b = uniqueId();

    const first = openRegistry();
    await first.whenLoaded;
    first.add({ id: a, kind: "flow-sheet", title: "Alpha", createdAt: 100 });
    first.add({ id: b, kind: "speech-doc", title: "Beta", createdAt: 200 });
    first.touch(a, 300);
    await first.close();

    // A genuinely separate registry - new Y.Doc, new provider - reads the
    // entries back out of IndexedDB.
    const second: DocumentRegistry = openRegistry();
    await second.whenLoaded;

    expect(second.list().map((e) => e.id)).toEqual([a, b]);
    expect(second.get(a)).toEqual({
      id: a,
      kind: "flow-sheet",
      title: "Alpha",
      createdAt: 100,
      lastEditedAt: 300,
    });
    expect(second.get(b)?.title).toBe("Beta");

    await second.close();
  });
});

describe("close / teardown", () => {
  it("is idempotent", async () => {
    const registry = openRegistry();
    await registry.whenLoaded;

    expect(registry.closed).toBe(false);
    await registry.close();
    expect(registry.closed).toBe(true);
    await expect(registry.close()).resolves.toBeUndefined();
  });
});
