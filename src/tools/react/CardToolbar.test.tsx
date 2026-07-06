/**
 * Behavioral tests for the card-cutting toolbar container.
 *
 * The toolbar mounts on the block-file editor surface, enumerates the tools
 * registered on the shared registry (slice 1, `../registry`) in registration
 * order, invokes each tool's apply-to-selection handler against the live editor
 * selection on click, and disables every button (visibly + `aria-disabled`) when
 * there is no card the tools can act on.
 *
 * Applicability for a *card-cutting* toolbar is "a card is addressable at the
 * current selection" - `getSelectedCard`. These tests drive a real block-file +
 * card editor (the same `fake-indexeddb` harness the block-file suites use) and
 * assert on rendered roles and handler calls, never ProseMirror internals.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
  buildCardContent,
  getSideRegion,
} from "../../blockfile";
import { createPreferenceStore } from "../../preferences";
import {
  createCardToolRegistry,
  type RegisteredCardTool,
  type CardToolDefinition,
} from "../registry";
import { CardToolbar } from "./CardToolbar";

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

/**
 * Insert a card after the aff side's leading paragraph and return a text
 * position inside its tag region (so the selection resolves to that card).
 */
function insertCardInAff(editor: Editor): number {
  const aff = getSideRegion(editor, "aff");
  const at = aff.contentEnd;
  editor
    .chain()
    .insertContentAt(at, buildCardContent({ tag: "T" }), {
      updateSelection: false,
    })
    .run();
  // `at` is the position before the card; `at + 2` is inside its tag region.
  return at + 2;
}

/** A test tool whose apply is a spy, so clicks can be asserted. */
function registerSpyTool(
  registry: ReturnType<typeof createCardToolRegistry>,
  id: string,
  label: string,
): { tool: RegisteredCardTool; apply: ReturnType<typeof vi.fn> } {
  const apply = vi.fn(() => true);
  const definition: CardToolDefinition<{ marker: { default: string } }> = {
    id,
    label,
    settings: { marker: { default: id } },
    applyToSelection: apply,
  };
  const tool = registry.register(definition);
  return { tool, apply };
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

describe("CardToolbar", () => {
  it("renders one button per registered tool in registration order", async () => {
    const editor = await openEditor("order");
    const posInCard = insertCardInAff(editor);
    editor.commands.setTextSelection(posInCard);

    const registry = createCardToolRegistry(createPreferenceStore());
    registerSpyTool(registry, "extract", "Extract");
    registerSpyTool(registry, "shrink", "Shrink");
    registerSpyTool(registry, "condense", "Condense");

    render(<CardToolbar editor={editor} tools={registry.list()} />);

    const toolbar = screen.getByRole("toolbar", { name: /card tools/i });
    const buttons = within(toolbar).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Extract",
      "Shrink",
      "Condense",
    ]);
  });

  it("invokes the tool's apply with the live editor when an enabled button is clicked", async () => {
    const editor = await openEditor("click");
    const posInCard = insertCardInAff(editor);
    editor.commands.setTextSelection(posInCard);

    const registry = createCardToolRegistry(createPreferenceStore());
    const { apply } = registerSpyTool(registry, "extract", "Extract");

    render(<CardToolbar editor={editor} tools={registry.list()} />);

    fireEvent.click(screen.getByRole("button", { name: "Extract" }));

    expect(apply).toHaveBeenCalledTimes(1);
    // The registry forwards the live editor + settings snapshot to the handler.
    expect(apply).toHaveBeenCalledWith(editor, { marker: "extract" });
  });

  it("disables every tool (visibly + aria-disabled) when no card is selected", async () => {
    const editor = await openEditor("disabled");
    insertCardInAff(editor);
    // Caret in the aff leading paragraph - outside any card.
    editor.commands.setTextSelection(1);

    const registry = createCardToolRegistry(createPreferenceStore());
    const { apply } = registerSpyTool(registry, "extract", "Extract");

    render(<CardToolbar editor={editor} tools={registry.list()} />);

    const button = screen.getByRole("button", { name: "Extract" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");

    // A disabled tool never runs.
    fireEvent.click(button);
    expect(apply).not.toHaveBeenCalled();
  });

  it("disables every tool when there is no editor yet", () => {
    const registry = createCardToolRegistry(createPreferenceStore());
    registerSpyTool(registry, "extract", "Extract");

    render(<CardToolbar editor={null} tools={registry.list()} />);

    const button = screen.getByRole("button", { name: "Extract" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
  });

  it("enables tools when a card is addressable at the selection", async () => {
    const editor = await openEditor("enabled");
    const posInCard = insertCardInAff(editor);
    editor.commands.setTextSelection(posInCard);

    const registry = createCardToolRegistry(createPreferenceStore());
    registerSpyTool(registry, "extract", "Extract");

    render(<CardToolbar editor={editor} tools={registry.list()} />);

    const button = screen.getByRole("button", { name: "Extract" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-disabled", "false");
  });

  it("updates the disabled state live when the selection moves into a card", async () => {
    const editor = await openEditor("live");
    const posInCard = insertCardInAff(editor);
    // Start outside the card.
    editor.commands.setTextSelection(1);

    const registry = createCardToolRegistry(createPreferenceStore());
    registerSpyTool(registry, "extract", "Extract");

    render(<CardToolbar editor={editor} tools={registry.list()} />);

    const button = screen.getByRole("button", { name: "Extract" });
    expect(button).toBeDisabled();

    // Move the caret into the card; the toolbar tracks the editor's selection.
    act(() => {
      editor.commands.setTextSelection(posInCard);
    });

    expect(button).toBeEnabled();
  });

  it("renders nothing when no tools are registered", async () => {
    const editor = await openEditor("empty");

    const { container } = render(<CardToolbar editor={editor} tools={[]} />);

    expect(container.querySelector('[role="toolbar"]')).toBeNull();
  });
});
