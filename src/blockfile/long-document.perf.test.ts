/**
 * Long-document responsiveness evidence for the block file.
 *
 * A debater's block file grows across a season to hold every argument they might
 * read: many argument-type sections per side, each with a stack of cut cards
 * under it. This test builds a *representatively large* block file - far past a
 * realistic season - and measures the operations that decide whether the surface
 * stays responsive:
 *
 *   1. **Initial render**   - parse the persisted document into a fresh editor
 *                             (the cost paid every time the screen mounts).
 *   2. **Edit mid-document** - insert text into a section in the middle of a side
 *                             (the cost of typing while deep in the file).
 *   3. **Section query**     - `getSideSections` over a fully-populated side (the
 *                             read a ToC sidebar would do continuously).
 *   4. **Section reorder**   - `moveSection` carrying a section's whole content
 *                             block (the heaviest write the section-ops layer has).
 *
 * ## How to read the numbers
 *
 * jsdom wall-clock is **indicative, not authoritative** - it runs a synchronous
 * ProseMirror with no real layout/paint, on a loaded CI box, so absolute
 * milliseconds mean little. The value here is twofold:
 *
 *   - **Complexity, not the clock, is the real evidence.** Every block-file query
 *     and section op is scoped to *one side's direct children* (`region.node.forEach`
 *     in `argument-sections.ts` / `section-ops.ts`), never a full-document walk,
 *     and `sideRegionsFromDoc` touches only the two top-level section nodes. So
 *     query and reorder cost is O(direct children of the side), independent of how
 *     deep the card text under each section runs. The only inherently
 *     document-sized cost is ProseMirror's own parse/render of one large doc on
 *     mount - a property of holding the file in a single editor, not of anything
 *     this module adds.
 *
 *   - **The ceilings guard against a catastrophic regression** - an accidental
 *     O(n^2) full-document scan sneaking into a query or op would blow past these
 *     generous budgets even under jsdom's noise, failing the test. They are not
 *     tuned performance thresholds; they are smoke alarms.
 *
 * The documented conclusion (see `AGENTS.md`, "Long-document responsiveness"):
 * **no virtualization is warranted now.** The measured operations are all
 * linear-or-better in the side's section count and comfortably fast at a size
 * well beyond a real season; ProseMirror node-view virtualization would add
 * significant complexity to the shared editor for a problem the evidence does not
 * show. Revisit only if a real, measured regression appears at realistic sizes.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";

import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import type { BlockSide } from "./side";
import { BLOCK_FILE_FRAGMENT, blockFileExtensions } from "./schema";
import { getSideRegion } from "./sections";
import { getSideSections } from "./argument-sections";
import { moveSection, getSectionRange } from "./section-ops";

// --- Size of the representative block file ----------------------------------
//
// A generous "season's worth": many argument sections per side, each with a
// substantial stack of card-sized paragraphs. This is deliberately larger than a
// realistic file so a linear operation still finishes fast and a quadratic one
// does not.
const SECTIONS_PER_SIDE = 60;
const PARAS_PER_SECTION = 8;
const WORDS_PER_PARA = 40;

const WORD = "evidence";

let services: DocumentService[] = [];
let editors: Editor[] = [];

async function openServiceAndEditor(): Promise<{ service: DocumentService; handle: DocumentHandle; editor: Editor }> {
  const service = openDocumentService();
  services.push(service);
  await service.whenReady;
  const { id } = await service.create({ kind: "block-file", title: "Perf Test" });
  const handle = await service.open(id);
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  editors.push(editor);
  return { service, handle, editor };
}

async function reopenEditor(service: DocumentService, id: string): Promise<{ handle: DocumentHandle; editor: Editor }> {
  const handle = await service.open(id);
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({ extensions: blockFileExtensions }),
  });
  editors.push(editor);
  return { handle, editor };
}

/** A section header + PARAS_PER_SECTION card-sized body paragraphs. */
function sectionNodes(sideLabel: string, index: number): JSONContent[] {
  const paragraph = (p: number): JSONContent => ({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: `${sideLabel} ${index}.${p} ${`${WORD} `.repeat(WORDS_PER_PARA).trim()}`,
      },
    ],
  });
  const paras = Array.from({ length: PARAS_PER_SECTION }, (_, p) => paragraph(p));
  return [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: `AT: ${sideLabel} ${index}` }],
    },
    ...paras,
  ];
}

/** Fills one side with SECTIONS_PER_SIDE fully-populated sections in one transaction. */
function fillSide(editor: Editor, side: BlockSide): void {
  const { contentStart } = getSideRegion(editor, side);
  const label = side === "aff" ? "Aff" : "Neg";
  const content: JSONContent[] = [];
  for (let i = 0; i < SECTIONS_PER_SIDE; i++) {
    content.push(...sectionNodes(label, i));
  }
  // One insert of the whole side keeps the build itself off the hot path we
  // are measuring (each op below is measured on its own).
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

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const service of services) await service.close();
  editors = [];
  services = [];
});

describe("block-file long-document responsiveness", () => {
  it(
    "stays responsive on a season-sized file (build, render, edit, query, reorder)",
    async () => {
      // --- Build + persist a large file --------------------------------------
      const { service, handle: builderHandle, editor: builder } = await openServiceAndEditor();
      const blockFileId = builderHandle.id;
      const buildMs = ms(() => {
        fillSide(builder, "aff");
        fillSide(builder, "neg");
      });

      // Both sides are fully populated.
      expect(getSideSections(builder, "aff")).toHaveLength(SECTIONS_PER_SIDE);
      expect(getSideSections(builder, "neg")).toHaveLength(SECTIONS_PER_SIDE);

      // Drop the builder so the next editor parses the *persisted* document -
      // the real "open the screen" cost.
      builder.destroy();
      editors = editors.filter((e) => e !== builder);

      // --- 1. Initial render: parse the persisted doc into a fresh editor ----
      let editor!: Editor;
      const renderMs = await (async () => {
        const t0 = performance.now();
        ({ editor } = await reopenEditor(service, blockFileId));
        return performance.now() - t0;
      })();

      // The reopened editor sees the whole file.
      expect(getSideSections(editor, "aff")).toHaveLength(SECTIONS_PER_SIDE);
      expect(getSideSections(editor, "neg")).toHaveLength(SECTIONS_PER_SIDE);

      // --- 2. Edit mid-document: type into a section in the middle of aff ----
      const midIndex = Math.floor(SECTIONS_PER_SIDE / 2);
      const editMs = ms(() => {
        const midRange = getSectionRange(editor, "aff", midIndex);
        // midRange.from is immediately before the section heading node; +2 lands
        // inside the heading's text (the start of that node's inline content).
        editor
          .chain()
          .insertContentAt(midRange.from + 2, { type: "text", text: "typed " })
          .run();
      });

      // --- 3. Section query over a fully-populated side ----------------------
      let sectionCount = 0;
      const queryMs = ms(() => {
        for (let i = 0; i < 20; i++) {
          sectionCount = getSideSections(editor, "aff").length;
        }
      });
      expect(sectionCount).toBe(SECTIONS_PER_SIDE);

      // --- 4. Section reorder carrying a whole content block -----------------
      const reorderMs = ms(() => {
        // Move the last section (with all its body paragraphs) to the front.
        moveSection(editor, "aff", SECTIONS_PER_SIDE - 1, 0);
      });
      expect(getSideSections(editor, "aff")[0].label).toBe(
        `AT: Aff ${SECTIONS_PER_SIDE - 1}`,
      );

      // --- Report -------------------------------------------------------------
      const totalNodes = 2 * SECTIONS_PER_SIDE * (1 + PARAS_PER_SECTION);
      const totalWords = 2 * SECTIONS_PER_SIDE * PARAS_PER_SECTION * WORDS_PER_PARA;
      console.log(
        [
          "",
          `block-file long-document responsiveness (jsdom, indicative)`,
          `  size: ${SECTIONS_PER_SIDE} sections/side, ${totalNodes} block nodes, ~${totalWords} words`,
          `  build (both sides, one insert each): ${buildMs.toFixed(1)}ms`,
          `  initial render (parse persisted doc): ${renderMs.toFixed(1)}ms`,
          `  edit mid-document (insert text):      ${editMs.toFixed(1)}ms`,
          `  section query x20 (getSideSections):  ${queryMs.toFixed(1)}ms`,
          `  section reorder (moveSection):        ${reorderMs.toFixed(1)}ms`,
          "",
        ].join("\n"),
      );

      // --- Regression ceilings (smoke alarms, not tuned thresholds) ----------
      // Generous enough to swallow jsdom/CI noise, tight enough that an
      // accidental O(n^2) full-document scan in a query or op fails the test.
      expect(renderMs).toBeLessThan(15000);
      expect(editMs).toBeLessThan(2000);
      expect(queryMs).toBeLessThan(2000);
      expect(reorderMs).toBeLessThan(3000);
    },
    30000,
  );
});
