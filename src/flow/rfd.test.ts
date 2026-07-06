// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// This drives the RFD (Reason For Decision) surface over a *real* flow-sheet
// handle: the fixed fragment name, and - the PRD's highest seam - a genuine
// close/reopen round-trip proving RFD text persists in the flow document and
// reloads intact.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import { FLOW_RFD_FRAGMENT } from "./rfd";

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

/**
 * Write plain text into the RFD `Y.XmlFragment` the same shape the shared Tiptap
 * editor writes (a `paragraph` holding text), so the round-trip exercises the
 * real persistence path.
 */
const writeRfdText = (handle: DocumentHandle, value: string) => {
  const fragment = handle.doc.getXmlFragment(FLOW_RFD_FRAGMENT);
  handle.doc.transact(() => {
    const paragraph = new Y.XmlElement("paragraph");
    const text = new Y.XmlText();
    text.insert(0, value);
    paragraph.insert(0, [text]);
    fragment.insert(0, [paragraph]);
  });
};

describe("FLOW_RFD_FRAGMENT", () => {
  it("is the fixed `rfd` fragment name (bound to a Yjs type forever)", () => {
    expect(FLOW_RFD_FRAGMENT).toBe("rfd");
  });

  it("is a distinct top-level fragment from the other flow fragments", () => {
    // A single fixed name, not an id-keyed content fragment, and not colliding
    // with columns/nodes/subpoints/edges.
    expect(FLOW_RFD_FRAGMENT).not.toContain(":");
    expect(FLOW_RFD_FRAGMENT).not.toBe("columns");
    expect(FLOW_RFD_FRAGMENT).not.toBe("nodes");
  });
});

describe("RFD persistence", () => {
  it("survives a close and reopen: RFD text reloads intact", async () => {
    const id = uniqueId();

    // First session: record the judge's reason for the decision.
    {
      const handle = await openFlowSheet(id);
      writeRfdText(handle, "Aff wins on the framework debate; extend C1.");
      await handle.close();
    }

    // Second session: reopen the same document id from IndexedDB.
    {
      const handle = await openFlowSheet(id);
      const fragment = handle.doc.getXmlFragment(FLOW_RFD_FRAGMENT);
      expect(fragment.toString()).toContain(
        "Aff wins on the framework debate; extend C1.",
      );
      await handle.close();
    }
  });

  it("is empty on a fresh round until something is written", async () => {
    const handle = await openFlowSheet();
    const fragment = handle.doc.getXmlFragment(FLOW_RFD_FRAGMENT);
    expect(fragment.length).toBe(0);
    await handle.close();
  });
});
