// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// These tests drive the cross-application **copy** operation over a *real*
// flow-sheet handle: dragging an argument (a contention) to another column
// copies it there (original untouched), deep-copies its argument-row content and
// nested subpoints, and records a transparent arrow edge from the original to
// the copy - all persisting across a genuine close/reopen round-trip.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import { addColumn } from "./columns";
import { getNode } from "./nodes";
import {
  CONTENTION_KIND,
  addContention,
  contentionContentFragment,
  listContentions,
} from "./contention";
import {
  addSubpoint,
  listSubpoints,
  subpointContentFragment,
} from "./subpoint";
import { listEdges } from "./edges";
import { crossApplyContention } from "./cross-apply";

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
 * Writes a single-paragraph `<argument><response><paragraph>text` shape into a
 * flow-node fragment - the addressable argument-row structure the copy must
 * preserve. Mirrors what the shared Tiptap surface would persist.
 */
const writeArgumentText = (
  handle: DocumentHandle,
  fragmentName: string,
  text: string,
): void => {
  const fragment = handle.doc.getXmlFragment(fragmentName);
  handle.doc.transact(() => {
    const paragraph = new Y.XmlElement("paragraph");
    const textNode = new Y.XmlText();
    textNode.insert(0, text);
    paragraph.insert(0, [textNode]);
    const response = new Y.XmlElement("response");
    response.insert(0, [paragraph]);
    const argument = new Y.XmlElement("argument");
    argument.insert(0, [response]);
    fragment.insert(0, [argument]);
  });
};

describe("crossApplyContention", () => {
  it("copies the contention into the target column, leaving the original untouched", async () => {
    const handle = await openFlowSheet();
    const source = addColumn(handle, { side: "aff", label: "1AC" });
    const target = addColumn(handle, { side: "neg", label: "1NC" });
    const original = addContention(handle, source.id);
    writeArgumentText(
      handle,
      contentionContentFragment(original.id),
      "framework first",
    );

    const copy = crossApplyContention(handle, original.id, target.id);

    // The copy is a fresh contention in the target column.
    expect(copy.id).not.toBe(original.id);
    expect(copy.kind).toBe(CONTENTION_KIND);
    expect(copy.columnId).toBe(target.id);
    expect(listContentions(handle, target.id).map((n) => n.id)).toEqual([
      copy.id,
    ]);

    // The original is unchanged: still in its column, still holds its text.
    expect(getNode(handle, original.id)?.columnId).toBe(source.id);
    expect(listContentions(handle, source.id).map((n) => n.id)).toEqual([
      original.id,
    ]);
    expect(
      handle.doc
        .getXmlFragment(contentionContentFragment(original.id))
        .toString(),
    ).toContain("framework first");

    await handle.close();
  });

  it("deep-copies the argument-row content into the copy's own fragment", async () => {
    const handle = await openFlowSheet();
    const source = addColumn(handle, { side: "aff", label: "1AC" });
    const target = addColumn(handle, { side: "neg", label: "1NC" });
    const original = addContention(handle, source.id);
    writeArgumentText(
      handle,
      contentionContentFragment(original.id),
      "extinction outweighs",
    );

    const copy = crossApplyContention(handle, original.id, target.id);

    const copyFragment = handle.doc
      .getXmlFragment(contentionContentFragment(copy.id))
      .toString();
    expect(copyFragment).toContain("extinction outweighs");
    // The addressable argument-row structure is preserved, not flattened to bare
    // text (the Yjs XML node names the argument-rows schema binds to).
    expect(copyFragment).toContain("<argument>");
    expect(copyFragment).toContain("<response>");

    // Editing the copy's fragment does not bleed into the original (true copy).
    writeArgumentText(
      handle,
      contentionContentFragment(copy.id),
      "second point",
    );
    expect(
      handle.doc
        .getXmlFragment(contentionContentFragment(original.id))
        .toString(),
    ).not.toContain("second point");

    await handle.close();
  });

  it("copies nested subpoints (membership and their text) under the copy", async () => {
    const handle = await openFlowSheet();
    const source = addColumn(handle, { side: "aff", label: "1AC" });
    const target = addColumn(handle, { side: "neg", label: "1NC" });
    const original = addContention(handle, source.id);
    const sub1 = addSubpoint(handle, original.id);
    writeArgumentText(handle, subpointContentFragment(sub1.id), "sub one");
    const sub2 = addSubpoint(handle, original.id);
    writeArgumentText(handle, subpointContentFragment(sub2.id), "sub two");

    const copy = crossApplyContention(handle, original.id, target.id);

    const copiedSubs = listSubpoints(handle, copy.id);
    expect(copiedSubs).toHaveLength(2);
    // Fresh ids nested under the copy, not the originals.
    expect(copiedSubs.map((s) => s.id)).not.toContain(sub1.id);
    expect(copiedSubs.every((s) => s.contentionId === copy.id)).toBe(true);
    // Their text came across in order.
    expect(
      handle.doc
        .getXmlFragment(subpointContentFragment(copiedSubs[0].id))
        .toString(),
    ).toContain("sub one");
    expect(
      handle.doc
        .getXmlFragment(subpointContentFragment(copiedSubs[1].id))
        .toString(),
    ).toContain("sub two");
    // The original's subpoints are untouched.
    expect(listSubpoints(handle, original.id).map((s) => s.id)).toEqual([
      sub1.id,
      sub2.id,
    ]);

    await handle.close();
  });

  it("records a transparent arrow edge from the original to the copy", async () => {
    const handle = await openFlowSheet();
    const source = addColumn(handle, { side: "aff", label: "1AC" });
    const target = addColumn(handle, { side: "neg", label: "1NC" });
    const original = addContention(handle, source.id);

    const copy = crossApplyContention(handle, original.id, target.id);

    const edges = listEdges(handle);
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceNodeId).toBe(original.id);
    expect(edges[0].targetNodeId).toBe(copy.id);

    await handle.close();
  });

  it("throws when the node is missing or is not a contention", async () => {
    const handle = await openFlowSheet();
    const source = addColumn(handle, { side: "aff", label: "1AC" });
    const target = addColumn(handle, { side: "neg", label: "1NC" });

    expect(() => crossApplyContention(handle, "nope", target.id)).toThrow();

    // A non-contention node in the source column is rejected too.
    const { addNode } = await import("./nodes");
    const other = addNode(handle, { columnId: source.id, kind: "other" });
    expect(() => crossApplyContention(handle, other.id, target.id)).toThrow();

    await handle.close();
  });
});

describe("cross-application persistence", () => {
  it("survives a close and reopen: the copy, its subpoints, and the arrow edge", async () => {
    const id = uniqueId();
    let targetColumnId: string;
    let originalId: string;
    let copyId: string;

    {
      const handle = await openFlowSheet(id);
      const source = addColumn(handle, { side: "aff", label: "1AC" });
      const target = addColumn(handle, { side: "neg", label: "1NC" });
      targetColumnId = target.id;
      const original = addContention(handle, source.id);
      originalId = original.id;
      writeArgumentText(
        handle,
        contentionContentFragment(original.id),
        "impact calculus",
      );
      addSubpoint(handle, original.id);

      const copy = crossApplyContention(handle, original.id, target.id);
      copyId = copy.id;
      await handle.close();
    }

    {
      const handle = await openFlowSheet(id);
      // The copy is still in the target column with its text.
      expect(listContentions(handle, targetColumnId).map((n) => n.id)).toEqual([
        copyId,
      ]);
      expect(
        handle.doc
          .getXmlFragment(contentionContentFragment(copyId))
          .toString(),
      ).toContain("impact calculus");
      // Its subpoint reloaded.
      expect(listSubpoints(handle, copyId)).toHaveLength(1);
      // The arrow edge reloaded pointing original -> copy.
      const edges = listEdges(handle);
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceNodeId).toBe(originalId);
      expect(edges[0].targetNodeId).toBe(copyId);
      await handle.close();
    }
  });
});
