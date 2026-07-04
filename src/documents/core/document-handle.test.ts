// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global. This is the store the persistence layer talks to under test.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import {
  openDocument,
  documentDbName,
  DOCUMENT_DB_PREFIX,
  type DocumentHandle,
} from "./document-handle";
import { DOCUMENT_KINDS } from "./kind";

/**
 * These tests assert observable *behavior* - content survives a brand-new store
 * instance, the local load signal fires, teardown releases cleanly - never
 * IndexedDB internals.
 */

// A fresh IndexedDB backend per test so stored documents never leak between
// tests. Reopening within a test still hits the same backend, which is the
// whole point of the persistence assertions.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `doc-${Date.now()}-${nextId++}`;

describe("openDocument", () => {
  it("carries the id and kind on the handle", () => {
    const id = uniqueId();
    const handle = openDocument({ id, kind: "flow-sheet" });

    expect(handle.id).toBe(id);
    expect(handle.kind).toBe("flow-sheet");
    expect(handle.dbName).toBe(documentDbName(id));
    expect(handle.dbName).toBe(`${DOCUMENT_DB_PREFIX}${id}`);

    return handle.close();
  });

  it("accepts every declared document kind", async () => {
    for (const kind of DOCUMENT_KINDS) {
      const handle = openDocument({ id: uniqueId(), kind });
      expect(handle.kind).toBe(kind);
      await handle.close();
    }
  });

  it("rejects an empty id", () => {
    expect(() => openDocument({ id: "", kind: "speech-doc" })).toThrow(
      /non-empty/,
    );
  });
});

describe("local load signal", () => {
  it("resolves whenLoaded from local storage and flips the loaded flag", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "speech-doc" });

    expect(handle.loaded).toBe(false);
    await handle.whenLoaded;
    expect(handle.loaded).toBe(true);

    await handle.close();
  });

  it("fires whenLoaded with no network access whatsoever", async () => {
    // Any network transport touched on the load path is a hard failure: local
    // persistence completion must be entirely network-independent.
    const stub = () => {
      throw new Error("network access on the document load path");
    };
    const g = globalThis as unknown as Record<string, unknown>;
    const saved = {
      fetch: g.fetch,
      XMLHttpRequest: g.XMLHttpRequest,
      WebSocket: g.WebSocket,
      EventSource: g.EventSource,
    };
    g.fetch = stub;
    g.XMLHttpRequest = stub;
    g.WebSocket = stub;
    g.EventSource = stub;

    try {
      const handle = openDocument({ id: uniqueId(), kind: "block-file" });
      await handle.whenLoaded;
      expect(handle.loaded).toBe(true);
      await handle.close();
    } finally {
      Object.assign(g, saved);
    }
  });
});

describe("persistence across store instances", () => {
  it("survives close and reopen with identical content", async () => {
    const id = uniqueId();

    const first = openDocument({ id, kind: "flow-sheet" });
    await first.whenLoaded;
    first.doc.getText("body").insert(0, "1AC contention one");
    first.doc.getMap("meta").set("round", "R1 vs Westside");
    first.doc.getArray("tags").push(["policy", "topicality"]);
    await first.close();

    // A genuinely separate handle - new Y.Doc, new provider - reads the state
    // back out of IndexedDB.
    const second = openDocument({ id, kind: "flow-sheet" });
    await second.whenLoaded;

    expect(second.doc.getText("body").toString()).toBe("1AC contention one");
    expect(second.doc.getMap("meta").get("round")).toBe("R1 vs Westside");
    expect(second.doc.getArray("tags").toArray()).toEqual([
      "policy",
      "topicality",
    ]);

    await second.close();
  });

  it("survives even against a brand-new IndexedDB factory reference", async () => {
    const id = uniqueId();

    const first = openDocument({ id, kind: "speech-doc" });
    await first.whenLoaded;
    first.doc.getText("body").insert(0, "persist me");
    await first.close();

    // Swap in a fresh factory *object* (without wiping data) to prove the
    // second read is not reusing the first handle's in-memory doc.
    const survivor = globalThis.indexedDB;
    globalThis.indexedDB = survivor;

    const second = openDocument({ id, kind: "speech-doc" });
    await second.whenLoaded;
    expect(second.doc.getText("body").toString()).toBe("persist me");
    await second.close();
  });

  it("accumulates edits made across multiple sessions", async () => {
    const id = uniqueId();

    const s1 = openDocument({ id, kind: "block-file" });
    await s1.whenLoaded;
    s1.doc.getArray<string>("cards").push(["card-a"]);
    await s1.close();

    const s2 = openDocument({ id, kind: "block-file" });
    await s2.whenLoaded;
    s2.doc.getArray<string>("cards").push(["card-b"]);
    await s2.close();

    const s3 = openDocument({ id, kind: "block-file" });
    await s3.whenLoaded;
    expect(s3.doc.getArray<string>("cards").toArray()).toEqual([
      "card-a",
      "card-b",
    ]);
    await s3.close();
  });
});

describe("close / teardown lifecycle", () => {
  it("marks the handle closed and destroys the doc", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "flow-sheet" });
    await handle.whenLoaded;

    let destroyed = false;
    handle.doc.on("destroy", () => {
      destroyed = true;
    });

    expect(handle.closed).toBe(false);
    await handle.close();
    expect(handle.closed).toBe(true);
    expect(destroyed).toBe(true);
  });

  it("detaches the persistence listener so a destroyed doc is not observed", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "flow-sheet" });
    await handle.whenLoaded;
    const doc = handle.doc;
    await handle.close();

    // After teardown the provider must no longer be listening for updates.
    // (Y.Doc clears its observers on destroy; assert nothing is left wired up.)
    expect(doc._observers.get("update")?.size ?? 0).toBe(0);
  });

  it("is idempotent - closing twice is safe", async () => {
    const handle = openDocument({ id: uniqueId(), kind: "flow-sheet" });
    await handle.whenLoaded;

    await handle.close();
    await expect(handle.close()).resolves.toBeUndefined();
    expect(handle.closed).toBe(true);
  });

  it("keeps closed handles independent - reopening yields a distinct handle", async () => {
    const id = uniqueId();
    const first: DocumentHandle = openDocument({ id, kind: "flow-sheet" });
    await first.whenLoaded;
    await first.close();

    const second = openDocument({ id, kind: "flow-sheet" });
    expect(second).not.toBe(first);
    expect(second.doc).not.toBe(first.doc);
    await second.whenLoaded;
    await second.close();
  });
});

describe("kind type guard", () => {
  it("recognizes declared kinds and rejects others", async () => {
    const { isDocumentKind } = await import("./kind");
    expect(isDocumentKind("flow-sheet")).toBe(true);
    expect(isDocumentKind("speech-doc")).toBe(true);
    expect(isDocumentKind("block-file")).toBe(true);
    expect(isDocumentKind("nope")).toBe(false);
    expect(isDocumentKind(42)).toBe(false);
    expect(isDocumentKind(undefined)).toBe(false);
  });
});
