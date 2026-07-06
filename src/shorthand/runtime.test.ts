/**
 * Behavioural tests for the surface-generic shorthand **runtime seam**: the live
 * `{ lookup, enabled }` an editor carries on storage, and {@link expandTransition},
 * which composes the engine with that runtime so a surface's keymap expands the
 * completed text *only when the scope gate is on and a lookup is present* before
 * running its transition.
 *
 * Driven over a real Tiptap editor bound to a real flow-sheet fragment (the exact
 * argument-row composition the flow surfaces ship), plus the runtime extension.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor, JSONContent } from "@tiptap/core";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { argumentRowExtensions, newArgumentRow } from "../flow/argument-rows";
import type { ShorthandLookup } from "./expand";
import {
  expandTransition,
  getShorthandRuntime,
  setShorthandRuntime,
  shorthandRuntimeExtension,
} from "./runtime";

const DICT: Record<string, string> = { aff: "affirmative", neg: "negative" };
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

/** The flow composition plus the runtime storage slot. */
function openEditor(handle: DocumentHandle): Editor {
  const editor = createEditor({
    binding: { handle, fragment: "contention:test" },
    extensions: editorPreset({
      extensions: [...argumentRowExtensions, shorthandRuntimeExtension],
    }),
  });
  editors.push(editor);
  return editor;
}

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

const rowsOf = (editor: Editor): JSONContent[] => editor.getJSON().content ?? [];

describe("shorthand runtime storage", () => {
  it("defaults to a disabled runtime before any binding pushes one", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);
    expect(getShorthandRuntime(editor)).toEqual({ lookup: null, enabled: false });
  });

  it("round-trips a pushed runtime", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);
    setShorthandRuntime(editor, { lookup, enabled: true });
    expect(getShorthandRuntime(editor).enabled).toBe(true);
    expect(getShorthandRuntime(editor).lookup).toBe(lookup);
  });
});

describe("expandTransition (runtime-gated composition seam)", () => {
  it("expands the completed row, then runs the transition, when enabled", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);
    setShorthandRuntime(editor, { lookup, enabled: true });

    editor.chain().focus().insertContent("aff outweighs").run();
    expect(expandTransition(editor, newArgumentRow)).toBe(true);

    const rows = rowsOf(editor);
    expect(rows).toHaveLength(2);
    expect(textOf(rows[0])).toBe("affirmative outweighs"); // completed row expanded
  });

  it("runs the transition WITHOUT expanding when the scope gate is off", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);
    setShorthandRuntime(editor, { lookup, enabled: false });

    editor.chain().focus().insertContent("aff outweighs").run();
    expect(expandTransition(editor, newArgumentRow)).toBe(true);

    const rows = rowsOf(editor);
    expect(rows).toHaveLength(2); // the transition still ran
    expect(textOf(rows[0])).toBe("aff outweighs"); // but nothing expanded
  });

  it("does not expand when enabled but no lookup is available", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);
    setShorthandRuntime(editor, { lookup: null, enabled: true });

    editor.chain().focus().insertContent("aff").run();
    expect(expandTransition(editor, newArgumentRow)).toBe(true);
    expect(textOf(rowsOf(editor)[0])).toBe("aff");
  });
});
