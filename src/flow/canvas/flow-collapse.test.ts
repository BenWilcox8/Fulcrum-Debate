// jsdom has no IndexedDB; the flow layer reads the global, so install the
// in-memory fake before anything touches it (the document-layer test pattern).
// Two halves are exercised here: the pure `collapseTargets` reducer (which ids
// to collapse for "Collapse All Except Active", given the container tree and the
// active node) and `readFlowContainerTree`, the handle read that enumerates the
// collapsible flow containers (contentions + their nested subpoints) and the
// subpoint -> contention parent map the reducer consumes.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { addColumn } from "../columns";
import { addContention } from "../contention";
import { addSubpoint } from "../subpoint";
import { collapseTargets, readFlowContainerTree } from "./flow-collapse";

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

describe("collapseTargets", () => {
  it("collapses every node when there is no active node", () => {
    const parentOf = new Map<string, string>();
    const targets = collapseTargets(["a", "b", "c"], null, parentOf);
    expect([...targets].sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps the active node expanded and collapses its siblings", () => {
    const parentOf = new Map<string, string>();
    const targets = collapseTargets(["c1", "c2", "c3"], "c2", parentOf);
    expect(targets.has("c2")).toBe(false);
    expect([...targets].sort()).toEqual(["c1", "c3"]);
  });

  it("keeps the active node's ancestor chain expanded (a nested subpoint)", () => {
    // s1 nests under c1; activating s1 must keep c1 open so s1 stays visible.
    const parentOf = new Map<string, string>([
      ["s1", "c1"],
      ["s2", "c1"],
    ]);
    const targets = collapseTargets(
      ["c1", "c2", "s1", "s2"],
      "s1",
      parentOf,
    );
    // Active subpoint and its parent contention stay expanded.
    expect(targets.has("s1")).toBe(false);
    expect(targets.has("c1")).toBe(false);
    // Everything else collapses.
    expect([...targets].sort()).toEqual(["c2", "s2"]);
  });

  it("returns an empty set when there are no nodes", () => {
    expect(collapseTargets([], "whatever", new Map()).size).toBe(0);
  });
});

describe("readFlowContainerTree", () => {
  it("enumerates every contention and subpoint with its parent map", async () => {
    const handle = await openFlowSheet();
    const col = addColumn(handle, { side: "aff", label: "1AC" });
    const c1 = addContention(handle, col.id);
    const c2 = addContention(handle, col.id);
    const s1 = addSubpoint(handle, c1.id);
    const s2 = addSubpoint(handle, c1.id);

    const { allIds, parentOf } = readFlowContainerTree(handle);

    expect([...allIds].sort()).toEqual(
      [c1.id, c2.id, s1.id, s2.id].sort(),
    );
    expect(parentOf.get(s1.id)).toBe(c1.id);
    expect(parentOf.get(s2.id)).toBe(c1.id);
    // Contentions have no parent container.
    expect(parentOf.has(c1.id)).toBe(false);
    expect(parentOf.has(c2.id)).toBe(false);

    await handle.close();
  });

  it("is empty for a flow sheet with no containers", async () => {
    const handle = await openFlowSheet();
    addColumn(handle, { side: "neg", label: "1NC" });

    const { allIds, parentOf } = readFlowContainerTree(handle);
    expect(allIds).toEqual([]);
    expect(parentOf.size).toBe(0);

    await handle.close();
  });
});
