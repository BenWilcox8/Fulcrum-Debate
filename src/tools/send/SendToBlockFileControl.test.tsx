/**
 * Behavioral tests for the Send-to-Block-File toolbar control.
 *
 * The control is the interactive counterpart to the pure send operations: a
 * toolbar button that opens a destination picker over the block file's argument
 * sections, sends the selected card there (copy or move), and confirms where it
 * landed. Drives a real block-file + card editor (the same `fake-indexeddb`
 * harness the block-file suites use) and asserts on rendered roles + the
 * resulting document, never ProseMirror internals.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  buildCardContent,
  addSection,
  getSectionRange,
  getSideSections,
  CARD_NODE_NAME,
} from "../../blockfile";
import { SendToBlockFileControl } from "./SendToBlockFileControl";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openEditor(id: string): Promise<Editor> {
  const handle = openDocument({ id, kind: "block-file" });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
    }),
  });
  editors.push(editor);
  return editor;
}

/** Insert a card at the end of section `index` in `side`, selecting it. */
function seedSelectedCard(
  editor: Editor,
  side: "aff" | "neg",
  index: number,
  fields: { tag?: string; tagline?: string },
): void {
  const at = getSectionRange(editor, side, index).to;
  editor
    .chain()
    .insertContentAt(at, buildCardContent(fields), { updateSelection: false })
    .run();
  editor.commands.setTextSelection(at + 2);
}

function cardsInSection(
  editor: Editor,
  side: "aff" | "neg",
  index: number,
): ProseMirrorNode[] {
  const { from, to } = getSectionRange(editor, side, index);
  const cards: ProseMirrorNode[] = [];
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.type.name === CARD_NODE_NAME) cards.push(node);
    return true;
  });
  return cards;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
  editors = [];
  handles = [];
});

describe("SendToBlockFileControl", () => {
  it("renders a Send button, disabled when no card is addressable", async () => {
    const editor = await openEditor("disabled");
    render(<SendToBlockFileControl editor={editor} enabled={false} />);
    expect(
      screen.getByRole("button", { name: /send to block file/i }),
    ).toBeDisabled();
  });

  it("opens the destination picker listing sections from both sides", async () => {
    const editor = await openEditor("open");
    addSection(editor, "aff", "AT: Gold");
    addSection(editor, "neg", "AT: Warming");
    seedSelectedCard(editor, "aff", 0, { tag: "T" });

    render(<SendToBlockFileControl editor={editor} enabled />);
    fireEvent.click(
      screen.getByRole("button", { name: /send to block file/i }),
    );

    const dialog = screen.getByRole("group", { name: /send to block file/i });
    const select = within(dialog).getByLabelText(/destination/i);
    expect(within(select).getByRole("option", { name: "AT: Gold" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "AT: Warming" })).toBeInTheDocument();
  });

  it("copies the selected card into the chosen section and confirms the destination", async () => {
    const editor = await openEditor("copy");
    addSection(editor, "aff", "AT: Gold");
    addSection(editor, "neg", "AT: Warming");
    seedSelectedCard(editor, "aff", 0, { tag: "T", tagline: "Warming" });

    render(<SendToBlockFileControl editor={editor} enabled defaultMode="copy" />);
    fireEvent.click(
      screen.getByRole("button", { name: /send to block file/i }),
    );
    const dialog = screen.getByRole("group", { name: /send to block file/i });
    fireEvent.change(within(dialog).getByLabelText(/destination/i), {
      target: { value: "neg:0" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^send card$/i }));

    // Source intact, destination gets a copy.
    expect(cardsInSection(editor, "aff", 0)).toHaveLength(1);
    expect(cardsInSection(editor, "neg", 0)).toHaveLength(1);
    // Confirmation names where it landed.
    expect(screen.getByRole("status")).toHaveTextContent(/copied .* Negative .* AT: Warming/i);
  });

  it("moves the selected card, removing the source", async () => {
    const editor = await openEditor("move");
    addSection(editor, "aff", "AT: Gold");
    addSection(editor, "neg", "AT: Warming");
    seedSelectedCard(editor, "aff", 0, { tag: "T" });

    render(<SendToBlockFileControl editor={editor} enabled defaultMode="copy" />);
    fireEvent.click(
      screen.getByRole("button", { name: /send to block file/i }),
    );
    const dialog = screen.getByRole("group", { name: /send to block file/i });
    fireEvent.click(within(dialog).getByLabelText(/^move$/i));
    fireEvent.change(within(dialog).getByLabelText(/destination/i), {
      target: { value: "neg:0" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^send card$/i }));

    expect(cardsInSection(editor, "aff", 0)).toHaveLength(0);
    expect(cardsInSection(editor, "neg", 0)).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(/moved/i);
  });

  it("creates a new section on the fly and sends the card into it", async () => {
    const editor = await openEditor("new-section");
    addSection(editor, "aff", "AT: Gold");
    seedSelectedCard(editor, "aff", 0, { tag: "T" });

    render(<SendToBlockFileControl editor={editor} enabled defaultMode="copy" />);
    fireEvent.click(
      screen.getByRole("button", { name: /send to block file/i }),
    );
    const dialog = screen.getByRole("group", { name: /send to block file/i });
    fireEvent.change(within(dialog).getByLabelText(/destination/i), {
      target: { value: "new:neg" },
    });
    fireEvent.change(within(dialog).getByLabelText(/new section name/i), {
      target: { value: "AT: Fresh" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^send card$/i }));

    const negSections = getSideSections(editor, "neg");
    expect(negSections.map((s) => s.label)).toContain("AT: Fresh");
    const created = negSections.findIndex((s) => s.label === "AT: Fresh");
    expect(cardsInSection(editor, "neg", created)).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(/AT: Fresh/);
  });

  it("keeps Send disabled until a destination is chosen", async () => {
    const editor = await openEditor("guard");
    addSection(editor, "neg", "AT: Warming");
    seedSelectedCard(editor, "neg", 0, { tag: "T" });

    render(<SendToBlockFileControl editor={editor} enabled />);
    fireEvent.click(
      screen.getByRole("button", { name: /send to block file/i }),
    );
    const dialog = screen.getByRole("group", { name: /send to block file/i });
    expect(within(dialog).getByRole("button", { name: /^send card$/i })).toBeDisabled();
  });
});
