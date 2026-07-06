// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// These tests drive the Subpoint model over a *real* flow-sheet handle: the pure
// trigger parser and content-fragment naming, the nesting-enforcing
// `addSubpoint`/`listSubpoints` helpers keyed off a parent contention, and a
// genuine close/reopen round-trip proving a subpoint (its nesting and its text)
// survives reload.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import { addColumn } from "./columns";
import { addNode } from "./nodes";
import { addContention } from "./contention";
import {
  SUBPOINT_CONTENT_FRAGMENT_PREFIX,
  subpointContentFragment,
  parseSubpointTrigger,
  addSubpoint,
  listSubpoints,
  getSubpoint,
  removeSubpoint,
} from "./subpoint";

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

describe("parseSubpointTrigger", () => {
  it("recognises an S followed by a positive integer, case-insensitive", () => {
    expect(parseSubpointTrigger("S1")).toBe(1);
    expect(parseSubpointTrigger("S2")).toBe(2);
    expect(parseSubpointTrigger("S12")).toBe(12);
    expect(parseSubpointTrigger("s3")).toBe(3);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(parseSubpointTrigger("  S4  ")).toBe(4);
  });

  it("rejects anything that is not a bare S-number token", () => {
    expect(parseSubpointTrigger("")).toBeNull();
    expect(parseSubpointTrigger("S")).toBeNull();
    expect(parseSubpointTrigger("1")).toBeNull();
    expect(parseSubpointTrigger("C1")).toBeNull();
    expect(parseSubpointTrigger("X1")).toBeNull();
    expect(parseSubpointTrigger("SS")).toBeNull();
    expect(parseSubpointTrigger("S1a")).toBeNull();
    expect(parseSubpointTrigger("S0")).toBeNull();
    expect(parseSubpointTrigger("S-1")).toBeNull();
  });
});

describe("subpointContentFragment", () => {
  it("derives a stable, node-scoped fragment name", () => {
    expect(subpointContentFragment("abc")).toBe(
      `${SUBPOINT_CONTENT_FRAGMENT_PREFIX}abc`,
    );
  });

  it("gives distinct names for distinct nodes", () => {
    expect(subpointContentFragment("a")).not.toBe(subpointContentFragment("b"));
  });

  it("is distinct from a contention's content fragment for the same id", () => {
    // Subpoints and contentions share the node-id space conceptually, so their
    // fragment prefixes must not collide.
    expect(subpointContentFragment("x")).not.toBe("contention:x");
  });

  it("throws on an empty node id", () => {
    expect(() => subpointContentFragment("")).toThrow();
  });
});

describe("addSubpoint (nesting is enforced)", () => {
  it("adds a subpoint nested under a contention and returns it", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);

    const subpoint = addSubpoint(handle, contention.id);

    expect(subpoint.contentionId).toBe(contention.id);
    expect(getSubpoint(handle, subpoint.id)?.contentionId).toBe(contention.id);
    expect(listSubpoints(handle, contention.id).map((s) => s.id)).toEqual([
      subpoint.id,
    ]);

    await handle.close();
  });

  it("throws when the parent contention does not exist", async () => {
    const handle = await openFlowSheet();
    expect(() => addSubpoint(handle, "no-such-contention")).toThrow();
    await handle.close();
  });

  it("throws when the parent node is not a contention", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    // A non-contention flow node cannot host subpoints.
    const other = addNode(handle, { columnId: col.id, kind: "other" });
    expect(() => addSubpoint(handle, other.id)).toThrow();
    await handle.close();
  });
});

describe("listSubpoints", () => {
  it("returns a contention's subpoints in insertion (vertical) order", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);

    const s1 = addSubpoint(handle, contention.id);
    const s2 = addSubpoint(handle, contention.id);

    expect(listSubpoints(handle, contention.id).map((s) => s.id)).toEqual([
      s1.id,
      s2.id,
    ]);

    await handle.close();
  });

  it("scopes subpoints to their own contention", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);

    const a = addSubpoint(handle, c1.id);
    const b = addSubpoint(handle, c2.id);

    expect(listSubpoints(handle, c1.id).map((s) => s.id)).toEqual([a.id]);
    expect(listSubpoints(handle, c2.id).map((s) => s.id)).toEqual([b.id]);

    await handle.close();
  });

  it("is empty for a contention with no subpoints", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "neg", label: "1NC" });
    const contention = addContention(handle, col.id);
    expect(listSubpoints(handle, contention.id)).toEqual([]);
    await handle.close();
  });
});

describe("removeSubpoint", () => {
  it("removes a subpoint and is a no-op for an unknown id", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const contention = addContention(handle, col.id);
    const s1 = addSubpoint(handle, contention.id);
    const s2 = addSubpoint(handle, contention.id);

    removeSubpoint(handle, s1.id);
    expect(listSubpoints(handle, contention.id).map((s) => s.id)).toEqual([
      s2.id,
    ]);
    // Idempotent: removing a missing id does nothing.
    removeSubpoint(handle, "nope");
    expect(listSubpoints(handle, contention.id).map((s) => s.id)).toEqual([
      s2.id,
    ]);

    await handle.close();
  });
});

describe("subpoint persistence", () => {
  it("survives a close and reopen: nesting and subpoint text", async () => {
    const id = uniqueId();
    let contentionId: string;
    let subpointId: string;

    // First session: create a column, a contention, a nested subpoint, and write
    // text into the subpoint's own content fragment (a `paragraph` holding text,
    // the same shape the shared Tiptap editor writes).
    {
      const handle = await openFlowSheet(id);
      const col = addColumn(handle, { side: "aff", label: "1AC" });
      const contention = addContention(handle, col.id);
      contentionId = contention.id;
      const subpoint = addSubpoint(handle, contention.id);
      subpointId = subpoint.id;

      const fragment = handle.doc.getXmlFragment(
        subpointContentFragment(subpoint.id),
      );
      handle.doc.transact(() => {
        const paragraph = new Y.XmlElement("paragraph");
        const text = new Y.XmlText();
        text.insert(0, "no link to the DA");
        paragraph.insert(0, [text]);
        fragment.insert(0, [paragraph]);
      });
      await handle.close();
    }

    // Second session: reopen the same document id from IndexedDB.
    {
      const handle = await openFlowSheet(id);
      const subpoints = listSubpoints(handle, contentionId);
      expect(subpoints.map((s) => s.id)).toEqual([subpointId]);
      expect(getSubpoint(handle, subpointId)?.contentionId).toBe(contentionId);

      const fragment = handle.doc.getXmlFragment(
        subpointContentFragment(subpointId),
      );
      expect(fragment.toString()).toContain("no link to the DA");
      await handle.close();
    }
  });
});
