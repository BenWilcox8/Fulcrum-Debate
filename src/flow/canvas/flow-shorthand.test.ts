/**
 * Flow-surface integration for the Shorthand Engine (slice 2/2): the flow's
 * argument-row Enter / Shift+Enter keymap, composed with shorthand expansion, over
 * the **exact editor composition the contention / subpoint surfaces ship**
 * ({@link FLOW_ARGUMENT_PRESET}). It proves the acceptance criteria at the surface:
 *
 *  - typing an abbreviation in a flow argument and advancing with Enter /
 *    Shift+Enter expands it in the *completed* text (and only then);
 *  - the scope gate (carried as the editor's live runtime) disables expansion when
 *    the flow surface is excluded ('speech' / 'neither'), while the transition
 *    still fires.
 *
 * The keystrokes are driven through the editor DOM (`fireEvent.keyDown`), so this
 * also proves the shorthand-aware keymap wins over the editor's baseline Enter -
 * the same discipline as the argument-rows live-keyboard test.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { fireEvent } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import type { ShorthandLookup } from "../../shorthand";
import { setShorthandRuntime } from "../../shorthand";
import { FLOW_ARGUMENT_PRESET } from "./flow-argument-preset";

const DICT: Record<string, string> = {
  aff: "affirmative",
  neg: "negative",
  cx: "cross-examination",
};
const lookup: ShorthandLookup = (token) => DICT[token];

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  handles = [];
  editors = [];
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  for (const handle of handles) await handle.close();
});

let nextId = 0;
async function openFlowSheet(): Promise<DocumentHandle> {
  const handle = openDocument({
    id: `flow-${Date.now()}-${nextId++}`,
    kind: "flow-sheet",
  });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

/** The exact flow-node text surface composition (schema + shorthand keymap + runtime). */
function openFlowEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: "contention:test" },
    extensions: editorPreset(FLOW_ARGUMENT_PRESET),
  });
  editors.push(editor);
  return editor;
}

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

const rowsOf = (editor: Editor): JSONContent[] => editor.getJSON().content ?? [];
const responsesOf = (row: JSONContent): JSONContent[] => row.content ?? [];

describe("flow surface shorthand expansion (Enter)", () => {
  it("expands the abbreviation in the completed row and creates a fresh one", async () => {
    const handle = await openFlowSheet();
    const editor = openFlowEditor(handle);
    setShorthandRuntime(editor, { lookup, enabled: true });

    editor.chain().focus().insertContent("aff outweighs neg").run();
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    const rows = rowsOf(editor);
    expect(rows).toHaveLength(2); // Enter split into a new argument row
    expect(textOf(rows[0])).toBe("affirmative outweighs negative"); // completed row expanded
    expect(textOf(rows[1])).toBe(""); // fresh row is empty
  });

  it("does not expand a row that is still being typed (only the completed one)", async () => {
    const handle = await openFlowSheet();
    const editor = openFlowEditor(handle);
    setShorthandRuntime(editor, { lookup, enabled: true });

    editor.chain().focus().insertContent("aff").run();
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });
    // Type into the new (second) row but do not advance again.
    editor.chain().insertContent("neg").run();

    const rows = rowsOf(editor);
    expect(textOf(rows[0])).toBe("affirmative"); // completed at the transition
    expect(textOf(rows[1])).toBe("neg"); // not yet completed -> untouched
  });
});

describe("flow surface shorthand expansion (Shift+Enter)", () => {
  it("expands the completed response and appends a grouped one", async () => {
    const handle = await openFlowSheet();
    const editor = openFlowEditor(handle);
    setShorthandRuntime(editor, { lookup, enabled: true });

    editor.chain().focus().insertContent("cx checks").run();
    fireEvent.keyDown(editor.view.dom, { key: "Enter", shiftKey: true });

    const responses = responsesOf(rowsOf(editor)[0]);
    expect(responses).toHaveLength(2); // Shift+Enter grouped a second response
    expect(textOf(responses[0])).toBe("cross-examination checks");
  });
});

describe("scope gate at the flow surface", () => {
  it("disables expansion when the flow surface is excluded, but still transitions", async () => {
    const handle = await openFlowSheet();
    const editor = openFlowEditor(handle);
    // What the scope gate produces for a 'speech' / 'neither' scope on the flow.
    setShorthandRuntime(editor, { lookup, enabled: false });

    editor.chain().focus().insertContent("aff outweighs").run();
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    const rows = rowsOf(editor);
    expect(rows).toHaveLength(2); // the transition still ran
    expect(textOf(rows[0])).toBe("aff outweighs"); // but nothing expanded
  });

  it("does not expand with the default (disabled) runtime and no dictionary", async () => {
    const handle = await openFlowSheet();
    const editor = openFlowEditor(handle);
    // No setShorthandRuntime call: the runtime extension's disabled default holds.

    editor.chain().focus().insertContent("aff").run();
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    const rows = rowsOf(editor);
    expect(rows).toHaveLength(2);
    expect(textOf(rows[0])).toBe("aff");
  });
});
