/**
 * Long-document responsiveness evidence for the table-of-contents sidebar.
 *
 * A season's block file carries hundreds of headings - an argument-type header
 * per section, plus the subpoints, card tags, and analytics that nest beneath
 * each. The ToC sidebar is a *live* projection of that outline: it re-derives on
 * every document change and re-highlights on every scroll. This test builds a
 * block file with a heading count well past a realistic season - matching the
 * scale in `src/blockfile/long-document.perf.test.ts` (60 sections/side) but
 * with nested headings under each section, so the tree is genuinely deep - and
 * measures the four things that decide whether the sidebar stays responsive:
 *
 *   1. **Outline derivation** (`getOutline`)      - the whole-document walk that
 *                                                   feeds every ToC update.
 *   2. **Tree derivation** (`buildOutlineTree`)   - the pure flat->nested shaping
 *                                                   the sidebar renders.
 *   3. **Reactive re-render** (`TableOfContents`) - the React mount + the
 *                                                   re-render after a heading edit.
 *   4. **Scroll-highlight tracking**              - the pure active-heading
 *                                                   decision (`findActiveHeading`)
 *                                                   and the mounted scroll path.
 *
 * ## How to read the numbers
 *
 * The same discipline as the block-file perf test applies. jsdom wall-clock is
 * **indicative, not authoritative** (synchronous ProseMirror, no real layout or
 * paint, on a loaded CI box), so absolute milliseconds mean little. The real
 * evidence is complexity:
 *
 *   - `getOutline`/`buildOutlineTree` are each a single linear pass over the
 *     document / the flat outline - no nested scan, no per-heading document
 *     re-walk. `buildOutlineTree` is a pure O(headings) stack fold, and the ToC
 *     seam keeps it that way (the sidebar never re-derives nesting itself).
 *   - `findActiveHeading` is one linear pass over the heading offsets, run once
 *     per scroll event, so a scroll can never trigger worse-than-linear work.
 *
 * The ceilings below are **smoke alarms** for an accidental O(n^2) regression
 * (e.g. a per-heading full-document walk sneaking into the outline query, or the
 * sidebar re-deriving the tree per row), not tuned thresholds - they are
 * generous enough to swallow jsdom/CI noise. The documented conclusion mirrors
 * the block file's: the ToC layer adds no document-sized cost of its own beyond
 * the single linear passes it already makes, so no memoization or virtualization
 * is warranted now. Revisit only if a real, measured regression appears.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  getOutline,
  buildOutlineTree,
  type OutlineHeading,
} from "../editor/headings";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions, getSideRegion } from "../blockfile";
import type { BlockSide } from "../blockfile";
import { TableOfContents } from "./TableOfContents";
import { findActiveHeading, type HeadingOffset } from "./active-heading";

// --- Size of the representative block file ----------------------------------
//
// 60 argument sections per side (as in the block-file perf test), each carrying
// nested headings (subpoints + a card tag) plus card-sized paragraphs. That is
// HEADINGS_PER_SECTION * SECTIONS_PER_SIDE * 2 headings across the whole file -
// a deliberately deep, season-plus-sized outline.
const SECTIONS_PER_SIDE = 60;
const WORDS_PER_PARA = 40;

// Per section: one level-1 argument header, two level-2 subpoints, one level-3
// card tag = 4 headings, arranged so the tree nests three levels deep.
const HEADINGS_PER_SECTION = 4;
const TOTAL_HEADINGS = SECTIONS_PER_SIDE * HEADINGS_PER_SECTION * 2;

const WORD = "evidence";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

let nextId = 0;
const uniqueId = () => `toc-perf-${Date.now()}-${nextId++}`;

async function openBlockEditor(): Promise<{ handle: DocumentHandle; editor: Editor }> {
  const handle = openDocument({ id: uniqueId(), kind: "block-file" });
  handles.push(handle);
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  editors.push(editor);
  return { handle, editor };
}

const para = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const heading = (level: number, text: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

/** One deeply-nested argument section: h1 -> h2/h3 -> h2, with card paragraphs. */
function sectionNodes(sideLabel: string, index: number): JSONContent[] {
  const body = `${`${WORD} `.repeat(WORDS_PER_PARA).trim()}`;
  return [
    heading(1, `AT: ${sideLabel} ${index}`),
    para(`${sideLabel} ${index} ${body}`),
    heading(2, `${sideLabel} ${index} - Subpoint A`),
    heading(3, `${sideLabel} ${index} - Card A1`),
    para(`${sideLabel} ${index} card ${body}`),
    heading(2, `${sideLabel} ${index} - Subpoint B`),
    para(`${sideLabel} ${index} close ${body}`),
  ];
}

/** Fills one side with SECTIONS_PER_SIDE nested sections in one insert. */
function fillSide(editor: Editor, side: BlockSide): void {
  const { contentStart } = getSideRegion(editor, side);
  const label = side === "aff" ? "Aff" : "Neg";
  const content: JSONContent[] = [];
  for (let i = 0; i < SECTIONS_PER_SIDE; i++) {
    content.push(...sectionNodes(label, i));
  }
  editor.chain().insertContentAt(contentStart, content).run();
}

function ms(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  cleanup();
  for (const editor of editors) editor.destroy();
  editors = [];
  handles = [];
});

describe("table-of-contents long-document responsiveness", () => {
  it(
    "stays responsive on a season-sized outline (derive, build, render, scroll-highlight)",
    async () => {
      const { editor } = await openBlockEditor();
      const buildMs = ms(() => {
        fillSide(editor, "aff");
        fillSide(editor, "neg");
      });

      // The whole outline is present.
      const outline = getOutline(editor);
      expect(outline).toHaveLength(TOTAL_HEADINGS);

      // --- 1. Outline derivation: one whole-document walk --------------------
      let derived: OutlineHeading[] = [];
      const outlineMs = ms(() => {
        for (let i = 0; i < 20; i++) derived = getOutline(editor);
      });
      expect(derived).toHaveLength(TOTAL_HEADINGS);

      // --- 2. Tree derivation: the pure flat->nested shaping -----------------
      let treeRoots = 0;
      const treeMs = ms(() => {
        for (let i = 0; i < 50; i++) {
          treeRoots = buildOutlineTree(derived).length;
        }
      });
      // Each section's h1 is a root (its h2/h3 nest beneath), so roots == the
      // level-1 header count across both sides.
      expect(treeRoots).toBe(SECTIONS_PER_SIDE * 2);

      // --- 3. Reactive re-render: mount the sidebar over the live editor -----
      let renderResult!: ReturnType<typeof render>;
      const mountMs = ms(() => {
        act(() => {
          renderResult = render(<TableOfContents editor={editor} />);
        });
      });
      // The sidebar rendered a row per heading (rows are <li>s in the nav).
      const nav = renderResult.container.querySelector("nav");
      expect(nav?.querySelectorAll("li").length).toBe(TOTAL_HEADINGS);

      // Re-render after a heading edit: the observer re-derives, rebuilds the
      // tree, and React reconciles the whole list. Insert a new section header
      // at the top of the aff side.
      const rerenderMs = ms(() => {
        act(() => {
          const { contentStart } = getSideRegion(editor, "aff");
          editor
            .chain()
            .insertContentAt(contentStart, heading(1, "AT: Fresh Section"))
            .run();
        });
      });
      expect(nav?.querySelectorAll("li").length).toBe(TOTAL_HEADINGS + 1);

      // --- 4. Scroll-highlight tracking -------------------------------------
      // Synthetic content-top offsets (one per heading, ascending) stand in for
      // the DOM measurement jsdom cannot do; the pure decision is what runs on
      // every scroll event. Drive it across the whole scroll range.
      const offsets: HeadingOffset[] = getOutline(editor).map((h, i) => ({
        pos: h.pos,
        top: i * 50,
      }));
      const maxScroll = offsets.length * 50;
      let lastActive: number | null = null;
      const scrollMs = ms(() => {
        // Far more scroll samples than a user could generate between paints;
        // each is one findActiveHeading pass.
        for (let s = 0; s <= maxScroll; s += 25) {
          lastActive = findActiveHeading(offsets, s);
        }
      });
      // Scrolled to the bottom, the last heading is active.
      expect(lastActive).toBe(offsets[offsets.length - 1].pos);

      // --- Report -----------------------------------------------------------
      console.log(
        [
          "",
          `table-of-contents long-document responsiveness (jsdom, indicative)`,
          `  size: ${TOTAL_HEADINGS} headings (${SECTIONS_PER_SIDE} sections/side, 3 levels deep)`,
          `  build (both sides, one insert each):   ${buildMs.toFixed(1)}ms`,
          `  outline derive x20 (getOutline):       ${outlineMs.toFixed(1)}ms`,
          `  tree build x50 (buildOutlineTree):     ${treeMs.toFixed(1)}ms`,
          `  sidebar mount (TableOfContents):       ${mountMs.toFixed(1)}ms`,
          `  sidebar re-render after edit:          ${rerenderMs.toFixed(1)}ms`,
          `  scroll-highlight sweep (findActive):   ${scrollMs.toFixed(1)}ms`,
          "",
        ].join("\n"),
      );

      // --- Regression ceilings (smoke alarms, not tuned thresholds) ---------
      expect(outlineMs).toBeLessThan(2000);
      expect(treeMs).toBeLessThan(2000);
      expect(mountMs).toBeLessThan(5000);
      expect(rerenderMs).toBeLessThan(3000);
      expect(scrollMs).toBeLessThan(2000);
    },
    30000,
  );
});
