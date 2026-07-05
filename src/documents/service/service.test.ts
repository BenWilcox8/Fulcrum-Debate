// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern the core and registry tests use.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocumentService } from "./service";
import { openDocument, documentDbName } from "../core";

/**
 * These tests assert observable *behavior* through the service seam - that a
 * created document's content and metadata survive a genuinely fresh service
 * instance over the same store, that delete wipes both the entry and the
 * content database, that rename and edit-tracking flow through - never Yjs or
 * IndexedDB internals.
 */

// A fresh IndexedDB backend per test so nothing leaks between tests. Reopening
// within a test still hits the same backend - the point of the restart tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Whether an IndexedDB database currently exists (has any stored content). */
async function databaseExists(name: string): Promise<boolean> {
  const dbs = await indexedDB.databases();
  return dbs.some((info) => info.name === name);
}

describe("create", () => {
  it("mints a unique id, registers the entry, and returns an open handle", async () => {
    const service = openDocumentService();

    const handle = await service.create({ kind: "flow-sheet", title: "R1 vs Westside" });
    await handle.whenLoaded;

    expect(handle.id).not.toHaveLength(0);
    expect(handle.kind).toBe("flow-sheet");

    const entries = await service.list();
    expect(entries.map((e) => ({ id: e.id, kind: e.kind, title: e.title }))).toEqual([
      { id: handle.id, kind: "flow-sheet", title: "R1 vs Westside" },
    ]);

    // A second create mints a distinct id.
    const other = await service.create({ kind: "speech-doc", title: "1AC" });
    expect(other.id).not.toBe(handle.id);

    await service.close();
  });
});

describe("create -> edit -> reload through the service", () => {
  it("returns the same content from a fresh service + store instance", async () => {
    const first = openDocumentService();
    const created = await first.create({ kind: "flow-sheet", title: "Draft" });
    await created.whenLoaded;
    const id = created.id;

    created.doc.getText("body").insert(0, "1AC contention one");
    created.doc.getMap("meta").set("round", "R1 vs Westside");
    await first.close();

    // A genuinely separate service - new registry, new provider - reads it back.
    const second = openDocumentService();
    await second.whenReady;

    // The registry list survives the reload.
    expect((await second.list()).map((e) => e.id)).toEqual([id]);

    const reopened = await second.open(id);
    await reopened.whenLoaded;
    expect(reopened.doc.getText("body").toString()).toBe("1AC contention one");
    expect(reopened.doc.getMap("meta").get("round")).toBe("R1 vs Westside");

    await second.close();
  });
});

describe("open", () => {
  it("returns the same cached handle for repeated calls", async () => {
    const service = openDocumentService();
    const created = await service.create({ kind: "block-file", title: "Blocks" });

    const a = await service.open(created.id);
    const b = await service.open(created.id);
    expect(a).toBe(created);
    expect(b).toBe(created);

    await service.close();
  });

  it("throws for an unregistered id", async () => {
    const service = openDocumentService();
    await expect(service.open("no-such-id")).rejects.toThrow(/no document registered/);
    await service.close();
  });

  it("attaches edit-tracking so content edits bump last-edited", async () => {
    const service = openDocumentService();
    const handle = await service.create({ kind: "speech-doc", title: "1AC" });
    await handle.whenLoaded;

    const before = (await service.list())[0].lastEditedAt;
    // Ensure a distinct clock tick so the bump is observable.
    await new Promise((r) => setTimeout(r, 2));
    handle.doc.getText("body").insert(0, "contention one");

    const after = (await service.list())[0].lastEditedAt;
    expect(after).toBeGreaterThan(before);

    await service.close();
  });
});

describe("rename", () => {
  it("updates the registry title through the service", async () => {
    const service = openDocumentService();
    const handle = await service.create({ kind: "flow-sheet", title: "Draft" });

    const renamed = await service.rename(handle.id, "Final");
    expect(renamed.title).toBe("Final");
    expect((await service.list())[0].title).toBe("Final");

    await service.close();
  });
});

describe("remove", () => {
  it("deletes both the registry entry and the content database", async () => {
    const service = openDocumentService();
    const handle = await service.create({ kind: "block-file", title: "Blocks" });
    await handle.whenLoaded;
    const id = handle.id;

    handle.doc.getArray<string>("cards").push(["card-a"]);
    // Let the write commit to IndexedDB so the database materializes.
    await new Promise((r) => setTimeout(r, 5));
    expect(await databaseExists(documentDbName(id))).toBe(true);

    await service.remove(id);

    // Registry entry is gone.
    expect(await service.list()).toEqual([]);
    // Content database is gone.
    expect(await databaseExists(documentDbName(id))).toBe(false);

    await service.close();
  });

  it("is safe for an unregistered id", async () => {
    const service = openDocumentService();
    await expect(service.remove("no-such-id")).resolves.toBeUndefined();
    await service.close();
  });

  it("leaves no stale content behind - reopening the id yields an empty document", async () => {
    const first = openDocumentService();
    const handle = await first.create({ kind: "block-file", title: "Blocks" });
    await handle.whenLoaded;
    const id = handle.id;
    handle.doc.getArray<string>("cards").push(["card-a"]);
    await new Promise((r) => setTimeout(r, 5));
    await first.remove(id);
    await first.close();

    // A raw core handle on the same id sees no persisted content.
    const raw = openDocument({ id, kind: "block-file" });
    await raw.whenLoaded;
    expect(raw.doc.getArray<string>("cards").toArray()).toEqual([]);
    await raw.close();
  });
});

describe("close / lifecycle", () => {
  it("closes tracked handles and the registry, and is idempotent", async () => {
    const service = openDocumentService();
    const handle = await service.create({ kind: "flow-sheet", title: "Draft" });
    await handle.whenLoaded;

    expect(handle.closed).toBe(false);
    await service.close();
    expect(handle.closed).toBe(true);

    await expect(service.close()).resolves.toBeUndefined();
  });

  it("rejects use after close", async () => {
    const service = openDocumentService();
    await service.whenReady;
    await service.close();

    await expect(service.create({ kind: "flow-sheet", title: "x" })).rejects.toThrow(
      /closed/,
    );
    await expect(service.list()).rejects.toThrow(/closed/);
  });
});
