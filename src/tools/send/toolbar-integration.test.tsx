/**
 * Integration test for the Send tool's toolbar wiring: it proves the Send tool
 * is enumerated by the shipped-tools hook and that the toolbar renders its custom
 * destination-picker control (not a plain apply-button) via the `renderControl`
 * seam.
 *
 * Follows the block-file harness (`fake-indexeddb` + fresh `IDBFactory`) so a
 * real card is addressable at the selection and the toolbar enables.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
import { CardToolbar, useCardTools } from "../react";
import { SEND_TOOL_ID } from "./sendTool";

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

async function openEditorWithCard(id: string): Promise<Editor> {
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
  const at = getSideRegion(editor, "aff").contentEnd;
  editor
    .chain()
    .insertContentAt(at, buildCardContent({ tag: "T" }), {
      updateSelection: false,
    })
    .run();
  editor.commands.setTextSelection(at + 2);
  return editor;
}

/** A tiny harness that renders the real toolbar over the shipped tools. */
function Harness({ editor }: { editor: Editor | null }) {
  const tools = useCardTools();
  return <CardToolbar editor={editor} tools={tools} />;
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

describe("Send tool toolbar integration", () => {
  it("is one of the shipped tools", async () => {
    let captured: string[] = [];
    function Probe() {
      captured = useCardTools().map((t) => t.id);
      return null;
    }
    render(<Probe />);
    expect(captured).toContain(SEND_TOOL_ID);
  });

  it("renders its destination-picker control in the toolbar", async () => {
    const editor = await openEditorWithCard("integration");
    render(<Harness editor={editor} />);

    const toolbar = screen.getByRole("toolbar", { name: /card tools/i });
    const sendButton = within(toolbar).getByRole("button", {
      name: /send to block file/i,
    });
    // The control button drives the picker (aria-expanded), not a plain apply.
    expect(sendButton).toHaveAttribute("aria-expanded", "false");
    expect(sendButton).toBeEnabled();
  });
});
