/**
 * Whole-stack end-to-end proof for the Evidence Formatting Standards &
 * Customization feature (the closeout of its five slices).
 *
 * The four earlier slices unit-tested each piece in isolation: the pure profile
 * model + its preference section (`profile.test.ts`, `preferences.test.ts`), the
 * Settings panel driven by a bare store (`settings.test.tsx`), the standing
 * unformatted-shrink rule (`shrink.test.ts`), and the live profile->CSS rendering
 * (`css.test.ts`, `react/react.test.tsx`). This test closes the loop by composing
 * every seam the way the real app ships them, top to bottom, with *no mocks*:
 *
 *   - a real block-file editor built with the *exact* preset `BlockFileScreen`
 *     uses (`blockFileExtensions` + `cardExtensions` + `cardCreate`), over the real
 *     document service + `ensureBlockFile` singleton and IndexedDB, mounted through
 *     `EditorContent` so the card is a genuinely rendered node;
 *   - the live formatting stylesheet (`CardFormattingStyles`) the screen mounts,
 *     reading the shared, *persistent* preference store (`openPreferenceStore`);
 *   - the real Settings screen carrying the feature's own Formatting contribution
 *     (`formattingSettingsContribution`), so profile edits go through the actual
 *     panel UI, not a store poke.
 *
 * There is deliberately no `BlockFileScreen` render here: the shrink rule is an
 * editor command with no UI yet (a later feature), so the stack is composed
 * around a real editor instance the test can both drive and read - the same
 * approach `card.e2e.test.ts` takes for the card-unit API. Positions that drive
 * document reads come from an independent walk, never the code under test.
 *
 * It exercises the debater's actual formatting lifecycle end to end:
 *
 *   1. default render  -> a card renders and the mounted stylesheet encodes the
 *      house standard (tag 13pt bold, body 12pt, highlighted text underlined);
 *   2. Settings edit   -> changing the body size through the real Formatting panel
 *      restyles the open card's stylesheet live, with no reload;
 *   3. shrink rule      -> applying the standing rule (reading the live, panel-edited
 *      profile) shrinks the un-highlighted body run only, leaving the highlighted
 *      run and header regions untouched;
 *   4. reset            -> the Settings screen's per-section reset restores the whole
 *      standard, live and in the section values.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { HIGHLIGHT_MARK_NAME } from "../editor/marks";
import { ensureBlockFile } from "../blockfile-workspace";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  cardCreate,
  insertCard,
  focusSide,
  CARD_NODE_NAME,
  CARD_TAGLINE_NODE_NAME,
  CARD_CITE_NODE_NAME,
  CARD_BODY_NODE_NAME,
} from "../blockfile";
import {
  PreferenceStoreProvider,
  openPreferenceStore,
  type PersistentPreferenceStore,
} from "../preferences";
import { SettingsProvider, SettingsScreen } from "../settings";
import {
  DEFAULT_FORMATTING_PROFILE,
  FORMATTING_TARGET_LABELS,
  applyShrinkRule,
  formattingSettingsContribution,
  readFormattingProfile,
  registerFormattingSection,
  type FormattingSectionHandle,
} from "../formatting";
import { CardFormattingStyles } from "../formatting/react";

// A fresh IndexedDB backend per test isolates the document + preference stores.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let services: DocumentService[] = [];
let editors: Editor[] = [];
let stores: PersistentPreferenceStore[] = [];

afterEach(async () => {
  cleanup();
  for (const editor of editors) editor.destroy();
  for (const service of services) await service.close();
  for (const store of stores) await store.close();
  editors = [];
  services = [];
  stores = [];
});

/** A block-file editor with the exact preset `BlockFileScreen` ships. */
function openEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions, cardCreate],
    }),
  });
  editors.push(editor);
  return editor;
}

/**
 * A caret position inside a card region's first text block (independent walk;
 * never the card-unit API - the header regions are text blocks, the body holds
 * paragraphs).
 */
function caretInRegion(editor: Editor, nodeName: string): number {
  let target: number | null = null;
  editor.state.doc.descendants((node, at) => {
    if (target !== null) return false;
    if (node.type.name === nodeName) {
      target = node.isTextblock ? at + 1 : at + 2;
      return false;
    }
    return true;
  });
  if (target === null) throw new Error(`caretInRegion: no "${nodeName}" region`);
  return target;
}

/** Move the caret into a region and type `text` into it. */
function typeInto(editor: Editor, nodeName: string, text: string): void {
  editor
    .chain()
    .setTextSelection(caretInRegion(editor, nodeName))
    .insertContent(text)
    .run();
}

/** The `{ from, to }` range of a whole text run by its exact text (independent walk). */
function textRunRange(editor: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range) return false;
    if (node.isText && node.text === text) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`textRunRange: no run "${text}"`);
  return range;
}

/** The first `card` node in the document (independent walk), or null. */
function findFirstCard(editor: Editor): ProseMirrorNode | null {
  let card: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node) => {
    if (card) return false;
    if (node.type.name === CARD_NODE_NAME) {
      card = node;
      return false;
    }
    return true;
  });
  return card;
}

/**
 * The `fontSize` attribute of the `textStyle` mark on the first text run whose
 * text includes `substring` (independent walk), or null when the run carries no
 * such mark. This is how a shrunk run is read back as queryable document data.
 */
function runFontSize(editor: Editor, substring: string): string | null {
  let size: string | null = null;
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    if (node.isText && node.text?.includes(substring)) {
      found = true;
      const mark = node.marks.find((m) => m.type.name === "textStyle");
      const value = mark?.attrs.fontSize;
      size = typeof value === "string" ? value : null;
      return false;
    }
    return true;
  });
  if (!found) throw new Error(`runFontSize: no run containing "${substring}"`);
  return size;
}

/** Sorted mark-type names on the first text run whose text includes `substring`. */
function runMarkNames(editor: Editor, substring: string): string[] {
  let names: string[] = [];
  let found = false;
  editor.state.doc.descendants((node) => {
    if (found) return false;
    if (node.isText && node.text?.includes(substring)) {
      found = true;
      names = node.marks.map((m) => m.type.name).sort();
      return false;
    }
    return true;
  });
  if (!found) throw new Error(`runMarkNames: no run containing "${substring}"`);
  return names;
}

/** The mounted card-formatting stylesheet's current text. */
function cardCss(container: HTMLElement): string {
  const style = container.querySelector("style[data-card-formatting]");
  if (!style) throw new Error("no card-formatting stylesheet mounted");
  return style.textContent ?? "";
}

/** The single scoped CSS rule line targeting one card region. */
function regionRule(css: string, region: string): string {
  const line = css
    .split("\n")
    .find((l) => l.includes(`[data-card-region="${region}"]`));
  if (!line) throw new Error(`no rule for region "${region}"`);
  return line;
}

/** The point-string size the Settings panel's numeric control edits to. */
const EDITED_BODY_SIZE = "20pt";
/** A distinctive shrink size, off the standard 8pt, to prove shrink reads the live profile. */
const EDITED_SHRINK_SIZE = "6pt";

// The card's runs. The body holds one run to read aloud (highlighted) and one to
// skip (un-highlighted) - the classic two-tier card body the shrink rule targets.
const CARD = {
  tag: "T",
  tagline: "Warming is anthropogenic",
  cite: "Smith 24",
  bodyHighlighted: "read aloud",
  bodyUnformatted: "skip this",
};

/** Drives the numeric size control inside one target's control group. */
function editTargetSize(target: string, value: string): void {
  const group = screen.getByRole("group", {
    name: new RegExp(`^${target}$`, "i"),
  });
  fireEvent.change(within(group).getByLabelText(/size/i), {
    target: { value },
  });
}

describe("evidence formatting standards & customization end-to-end", () => {
  it("renders a card to the standard, restyles live on a Settings edit, shrinks unformatted runs, and resets", async () => {
    // --- Build the real editor + block-file singleton (author the card) ------
    const service = openDocumentService();
    services.push(service);
    const blockFileId = await ensureBlockFile(service);
    const handle = await service.open(blockFileId);
    await handle.whenLoaded;
    const editor = openEditor(handle);

    // Quick-create a card in the aff side and fill all four regions.
    focusSide(editor, "aff");
    insertCard(editor);
    editor.commands.insertContent(CARD.tag); // caret is already in the tag region
    typeInto(editor, CARD_TAGLINE_NODE_NAME, CARD.tagline);
    typeInto(editor, CARD_CITE_NODE_NAME, CARD.cite);
    typeInto(
      editor,
      CARD_BODY_NODE_NAME,
      `${CARD.bodyHighlighted} ${CARD.bodyUnformatted}`,
    );

    // Highlight only the read-aloud portion, splitting the body into a highlighted
    // run and an un-highlighted (unformatted) run.
    const bodyRange = textRunRange(
      editor,
      `${CARD.bodyHighlighted} ${CARD.bodyUnformatted}`,
    );
    editor
      .chain()
      .setTextSelection({
        from: bodyRange.from,
        to: bodyRange.from + CARD.bodyHighlighted.length,
      })
      .setHighlight()
      .run();

    // Sanity: the two body runs are classified as intended (one highlighted, one not).
    expect(runMarkNames(editor, CARD.bodyHighlighted)).toContain(
      HIGHLIGHT_MARK_NAME,
    );
    expect(runMarkNames(editor, CARD.bodyUnformatted)).not.toContain(
      HIGHLIGHT_MARK_NAME,
    );

    // --- Mount the shipped formatting + Settings stack over one shared store --
    const store = openPreferenceStore();
    stores.push(store);
    await store.whenLoaded;
    // The same live section the panel writes and the shrink rule reads (idempotent
    // registration returns the handle SettingsProvider registered).
    const formatting: FormattingSectionHandle = registerFormattingSection(store);

    const { container } = render(
      <PreferenceStoreProvider store={store}>
        <SettingsProvider contributions={[formattingSettingsContribution]}>
          {/* The screen mounts exactly this: the live stylesheet beside the
              editor surface. */}
          <CardFormattingStyles />
          <div className="block-file-editor">
            <EditorContent editor={editor} />
          </div>
          <SettingsScreen />
        </SettingsProvider>
      </PreferenceStoreProvider>,
    );

    // 1) Default render: the card is a real rendered node with all four region
    //    hooks, and the mounted stylesheet encodes the house standard.
    const cardEl = container.querySelector("[data-card]");
    expect(cardEl).not.toBeNull();
    for (const region of ["tag", "tagline", "cite", "body"]) {
      expect(
        cardEl!.querySelector(`[data-card-region="${region}"]`),
      ).not.toBeNull();
    }
    expect(findFirstCard(editor)).not.toBeNull();

    expect(regionRule(cardCss(container), "tag")).toContain("font-size: 13pt");
    expect(regionRule(cardCss(container), "tag")).toContain("font-weight: bold");
    expect(regionRule(cardCss(container), "body")).toContain("font-size: 12pt");
    // The highlight <mark> rule carries the underline treatment.
    const markRule = cardCss(container)
      .split("\n")
      .find((l) => /\smark\s/.test(l))!;
    expect(markRule).toContain("text-decoration: underline");

    // 2) Settings edit: change the body size through the real Formatting panel;
    //    the open card's stylesheet restyles live, no reload.
    editTargetSize(FORMATTING_TARGET_LABELS.body, "20");
    await waitFor(() =>
      expect(regionRule(cardCss(container), "body")).toContain(
        `font-size: ${EDITED_BODY_SIZE}`,
      ),
    );
    // The store agrees; the tag target is untouched.
    expect(formatting.get("body").fontSize).toBe(EDITED_BODY_SIZE);
    expect(formatting.get("tag").fontSize).toBe("13pt");

    // 3) Shrink rule: edit the unformatted target through the panel too, then apply
    //    the standing rule reading the *live* profile. Only the un-highlighted body
    //    run is shrunk; the highlighted run and the header regions are untouched.
    editTargetSize(FORMATTING_TARGET_LABELS.unformatted, "6");
    expect(formatting.get("unformatted").fontSize).toBe(EDITED_SHRINK_SIZE);

    const changed = applyShrinkRule(editor, readFormattingProfile(formatting));
    expect(changed).toBe(true);

    expect(runFontSize(editor, CARD.bodyUnformatted)).toBe(EDITED_SHRINK_SIZE);
    // The highlighted (named-style) run and the tag header keep their sizing.
    expect(runFontSize(editor, CARD.bodyHighlighted)).not.toBe(EDITED_SHRINK_SIZE);
    expect(runFontSize(editor, CARD.tag)).not.toBe(EDITED_SHRINK_SIZE);
    // Idempotent: a second application finds nothing left to shrink.
    expect(applyShrinkRule(editor, readFormattingProfile(formatting))).toBe(false);

    // 4) Reset: the Settings screen's per-section reset restores the whole standard,
    //    live in the stylesheet and in the section values.
    fireEvent.click(screen.getByRole("button", { name: /reset.*default/i }));
    await waitFor(() =>
      expect(regionRule(cardCss(container), "body")).toContain("font-size: 12pt"),
    );
    expect(formatting.getAll()).toEqual(DEFAULT_FORMATTING_PROFILE);
  });
});
