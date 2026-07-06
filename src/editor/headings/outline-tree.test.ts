import { describe, it, expect } from "vitest";

import { buildOutlineTree, type OutlineTreeNode } from "./outline-tree";
import type { OutlineHeading } from "./outline";
import type { HeadingLevel } from "./heading-extension";

/**
 * Pure unit tests for the outline-to-tree derivation. There is no editor,
 * document, or ProseMirror dependency here - the derivation consumes a flat
 * {@link OutlineHeading}[] and returns nested nodes - so the tests need no
 * IndexedDB shim and assert on plain data structures only.
 */

let nextPos = 0;
/** Build an OutlineHeading with a monotonic, otherwise-irrelevant `pos`. */
const h = (level: HeadingLevel, text: string): OutlineHeading => ({
  level,
  text,
  pos: nextPos++,
});

/** Concise view of a tree for assertions: text + nested children only. */
type Shape = { text: string; children: Shape[] };
const shape = (nodes: OutlineTreeNode[]): Shape[] =>
  nodes.map((node) => ({ text: node.text, children: shape(node.children) }));

describe("buildOutlineTree", () => {
  it("nests each heading under the nearest preceding shallower heading", () => {
    const tree = buildOutlineTree([
      h(1, "One"),
      h(2, "One.A"),
      h(3, "One.A.i"),
    ]);

    expect(shape(tree)).toEqual([
      {
        text: "One",
        children: [
          { text: "One.A", children: [{ text: "One.A.i", children: [] }] },
        ],
      },
    ]);
  });

  it("makes a heading with no preceding shallower heading a root node", () => {
    const tree = buildOutlineTree([
      h(1, "First root"),
      h(1, "Second root"),
      h(2, "Child of second"),
    ]);

    expect(shape(tree)).toEqual([
      { text: "First root", children: [] },
      {
        text: "Second root",
        children: [{ text: "Child of second", children: [] }],
      },
    ]);
  });

  it("treats a deeper-than-expected first heading as a root", () => {
    // No preceding shallower heading exists, so a leading level-3 heading is a
    // root rather than being dropped.
    const tree = buildOutlineTree([h(3, "Orphan deep"), h(1, "Later root")]);

    expect(shape(tree)).toEqual([
      { text: "Orphan deep", children: [] },
      { text: "Later root", children: [] },
    ]);
  });

  it("makes two consecutive same-level headings siblings, not nested", () => {
    const tree = buildOutlineTree([
      h(1, "Parent"),
      h(2, "Sibling A"),
      h(2, "Sibling B"),
    ]);

    expect(shape(tree)).toEqual([
      {
        text: "Parent",
        children: [
          { text: "Sibling A", children: [] },
          { text: "Sibling B", children: [] },
        ],
      },
    ]);
  });

  it("pops back to the correct ancestor when nesting shallows again", () => {
    const tree = buildOutlineTree([
      h(1, "A"),
      h(2, "A.1"),
      h(3, "A.1.a"),
      h(2, "A.2"),
      h(1, "B"),
    ]);

    expect(shape(tree)).toEqual([
      {
        text: "A",
        children: [
          { text: "A.1", children: [{ text: "A.1.a", children: [] }] },
          { text: "A.2", children: [] },
        ],
      },
      { text: "B", children: [] },
    ]);
  });

  it("preserves level, text, and pos verbatim on every node", () => {
    const headings = [h(1, "Root"), h(2, "Child")];
    const tree = buildOutlineTree(headings);

    expect(tree[0]).toMatchObject({
      level: headings[0].level,
      text: headings[0].text,
      pos: headings[0].pos,
    });
    expect(tree[0].children[0]).toMatchObject({
      level: headings[1].level,
      text: headings[1].text,
      pos: headings[1].pos,
    });
  });

  it("returns an empty array for an empty outline", () => {
    expect(buildOutlineTree([])).toEqual([]);
  });

  it("is pure: equal input arrays yield structurally equal trees", () => {
    const input: OutlineHeading[] = [
      { level: 1, text: "One", pos: 0 },
      { level: 2, text: "One.A", pos: 5 },
      { level: 1, text: "Two", pos: 10 },
    ];
    const a = buildOutlineTree(input);
    const b = buildOutlineTree(input.map((entry) => ({ ...entry })));

    expect(a).toEqual(b);
    // The derivation does not mutate its input.
    expect(input).toEqual([
      { level: 1, text: "One", pos: 0 },
      { level: 2, text: "One.A", pos: 5 },
      { level: 1, text: "Two", pos: 10 },
    ]);
  });
});
