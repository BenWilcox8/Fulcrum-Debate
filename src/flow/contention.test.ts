// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// These tests drive the Contention container model over a *real* flow-sheet
// handle: the pure trigger parser and content-fragment naming, the
// `addContention`/`listContentions` helpers over the node-container contract,
// and a genuine close/reopen round-trip proving a contention (its membership and
// its argument text) survives reload.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import { addColumn } from "./columns";
import { addNode, getNode, listColumnNodes } from "./nodes";
import {
  CONTENTION_KIND,
  CONTENTION_CONTENT_FRAGMENT_PREFIX,
  contentionContentFragment,
  parseContentionTrigger,
  addContention,
  listContentions,
} from "./contention";

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `flow-${Date.now()}-${nextId++}`;

const openFlowSheet = async (id = uniqueId()): Promise<DocumentHandle> => {
  const handle = openDocument({ id, kind: "flow-sheet" });
  await handle.whenLoaded;
  return handle;
};

describe("parseContentionTrigger", () => {
  it("recognises a C followed by a positive integer, case-insensitive", () => {
    expect(parseContentionTrigger("C1")).toBe(1);
    expect(parseContentionTrigger("C2")).toBe(2);
    expect(parseContentionTrigger("C12")).toBe(12);
    expect(parseContentionTrigger("c3")).toBe(3);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(parseContentionTrigger("  C4  ")).toBe(4);
  });

  it("rejects anything that is not a bare C-number token", () => {
    expect(parseContentionTrigger("")).toBeNull();
    expect(parseContentionTrigger("C")).toBeNull();
    expect(parseContentionTrigger("1")).toBeNull();
    expect(parseContentionTrigger("X1")).toBeNull();
    expect(parseContentionTrigger("CC")).toBeNull();
    expect(parseContentionTrigger("C1a")).toBeNull();
    expect(parseContentionTrigger("C0")).toBeNull();
    expect(parseContentionTrigger("C-1")).toBeNull();
  });
});

describe("contentionContentFragment", () => {
  it("derives a stable, node-scoped fragment name", () => {
    expect(contentionContentFragment("abc")).toBe(
      `${CONTENTION_CONTENT_FRAGMENT_PREFIX}abc`,
    );
  });

  it("gives distinct names for distinct nodes", () => {
    expect(contentionContentFragment("a")).not.toBe(
      contentionContentFragment("b"),
    );
  });

  it("throws on an empty node id", () => {
    expect(() => contentionContentFragment("")).toThrow();
  });
});

describe("addContention", () => {
  it("adds a contention-kind node in the column and returns it", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });

    const contention = addContention(handle, col.id);

    expect(contention.kind).toBe(CONTENTION_KIND);
    expect(contention.columnId).toBe(col.id);
    expect(getNode(handle, contention.id)?.kind).toBe(CONTENTION_KIND);
    expect(listColumnNodes(handle, col.id).map((n) => n.id)).toEqual([
      contention.id,
    ]);

    await handle.close();
  });
});

describe("listContentions", () => {
  it("returns only contention-kind nodes in the column, in vertical order", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });

    const c1 = addContention(handle, col.id);
    // A non-contention node in the same column must be ignored.
    addNode(handle, { columnId: col.id, kind: "other" });
    const c2 = addContention(handle, col.id);

    expect(listContentions(handle, col.id).map((n) => n.id)).toEqual([
      c1.id,
      c2.id,
    ]);

    await handle.close();
  });

  it("is empty for a column with no contentions", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    expect(listContentions(handle, col.id)).toEqual([]);
    await handle.close();
  });
});

describe("contention persistence", () => {
  it("survives a close and reopen: membership and argument text", async () => {
    const id = uniqueId();
    let columnId: string;
    let contentionId: string;

    // First session: create a column, a contention, and write argument text
    // into the contention's own content fragment (a `paragraph` holding text,
    // the same shape the shared Tiptap editor writes).
    {
      const handle = await openFlowSheet(id);
      const col = addColumn(handle, { side: "aff", label: "1AC" });
      columnId = col.id;
      const contention = addContention(handle, col.id);
      contentionId = contention.id;

      const fragment = handle.doc.getXmlFragment(
        contentionContentFragment(contention.id),
      );
      handle.doc.transact(() => {
        const paragraph = new Y.XmlElement("paragraph");
        const text = new Y.XmlText();
        text.insert(0, "framework first");
        paragraph.insert(0, [text]);
        fragment.insert(0, [paragraph]);
      });
      await handle.close();
    }

    // Second session: reopen the same document id from IndexedDB.
    {
      const handle = await openFlowSheet(id);
      const contentions = listContentions(handle, columnId);
      expect(contentions.map((n) => n.id)).toEqual([contentionId]);
      expect(getNode(handle, contentionId)?.kind).toBe(CONTENTION_KIND);

      const fragment = handle.doc.getXmlFragment(
        contentionContentFragment(contentionId),
      );
      expect(fragment.toString()).toContain("framework first");
      await handle.close();
    }
  });
});
