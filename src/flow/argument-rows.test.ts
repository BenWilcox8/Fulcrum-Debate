/**
 * Behavioural tests for the flow-node **argument-row** semantics: the schema that
 * models a box's content as top-level *argument rows*, each grouping one or more
 * *responses* separated by dividers, plus the Enter / Shift+Enter transitions that
 * create them and the pure locator the drag/strike PRD addresses them through.
 *
 * Drives a *real* Tiptap editor bound to a real flow-sheet document fragment (the
 * exact composition the contention / subpoint surfaces ship), asserting on the
 * document JSON and the editor API - never ProseMirror plugin internals or pixels -
 * and proving a genuine close/reopen round-trip keeps the grouping addressable.
 * Positions that drive the locator come from an independent document walk, never
 * the API under test.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { openDocument, type DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  ARGUMENT_NODE_NAME,
  RESPONSE_NODE_NAME,
  argumentRowExtensions,
  argumentRowKeymap,
  newArgumentRow,
  newGroupedResponse,
  locateArgumentRows,
} from "./argument-rows";

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
const uniqueId = () => `flow-${Date.now()}-${nextId++}`;

async function openFlowSheet(id = uniqueId()): Promise<DocumentHandle> {
  const handle = openDocument({ id, kind: "flow-sheet" });
  await handle.whenLoaded;
  handles.push(handle);
  return handle;
}

/**
 * Build a flow-node text surface editor: the argument-row schema + keymap layered
 * onto a per-node content fragment through the shared preset's feature-extension
 * seam - the exact composition the contention / subpoint nodes ship.
 */
function openEditor(handle: DocumentHandle, fragment = "contention:test"): Editor {
  const editor = createEditor({
    binding: { handle, fragment },
    extensions: editorPreset({
      extensions: [...argumentRowExtensions, argumentRowKeymap],
    }),
  });
  editors.push(editor);
  return editor;
}

/** The doc JSON's top-level argument children. */
function argumentsOf(editor: Editor): JSONContent[] {
  return editor.getJSON().content ?? [];
}

/** The response children of one argument JSON node. */
function responsesOf(argument: JSONContent): JSONContent[] {
  return argument.content ?? [];
}

/** Flattened text of a JSON subtree. */
function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

describe("argument-row schema", () => {
  it("initialises a box to one empty argument row holding one response", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    const args = argumentsOf(editor);
    expect(args).toHaveLength(1);
    expect(args[0].type).toBe(ARGUMENT_NODE_NAME);
    const responses = responsesOf(args[0]);
    expect(responses).toHaveLength(1);
    expect(responses[0].type).toBe(RESPONSE_NODE_NAME);
    expect(responses[0].content?.[0].type).toBe("paragraph");
  });

  it("exposes stable node-type names as the schema contract", () => {
    expect(ARGUMENT_NODE_NAME).toBe("argument");
    expect(RESPONSE_NODE_NAME).toBe("response");
  });
});

describe("Enter -> new top-level argument row", () => {
  it("yields a second top-level argument row, caret ready in it", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("perm do both").run();
    const created = newArgumentRow(editor);
    expect(created).toBe(true);
    editor.chain().insertContent("severance is a VI").run();

    const args = argumentsOf(editor);
    expect(args).toHaveLength(2);
    // Each new argument row is its own group with exactly one response.
    expect(responsesOf(args[0])).toHaveLength(1);
    expect(responsesOf(args[1])).toHaveLength(1);
    expect(textOf(args[0])).toBe("perm do both");
    // The caret landed in the fresh row, so the next keystrokes filled it.
    expect(textOf(args[1])).toBe("severance is a VI");
  });
});

describe("Shift+Enter -> grouped response inside the same box", () => {
  it("appends a response to the current argument, not a new argument", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("they say: no link").run();
    const created = newGroupedResponse(editor);
    expect(created).toBe(true);
    editor.chain().insertContent("turn: link is offense").run();

    const args = argumentsOf(editor);
    // Still a single top-level argument row...
    expect(args).toHaveLength(1);
    // ...but now grouping two responses (the divider renders between them).
    const responses = responsesOf(args[0]);
    expect(responses).toHaveLength(2);
    expect(responses.every((r) => r.type === RESPONSE_NODE_NAME)).toBe(true);
    expect(textOf(responses[0])).toBe("they say: no link");
    expect(textOf(responses[1])).toBe("turn: link is offense");
  });

  it("keeps responses grouped under one argument across mixed gestures", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    // Argument 1 with two grouped responses, then a fresh argument 2.
    editor.chain().focus().insertContent("A1").run();
    newGroupedResponse(editor);
    editor.chain().insertContent("R1").run();
    newArgumentRow(editor);
    editor.chain().insertContent("A2").run();

    const args = argumentsOf(editor);
    expect(args).toHaveLength(2);
    expect(responsesOf(args[0])).toHaveLength(2);
    expect(responsesOf(args[1])).toHaveLength(1);
    expect(textOf(args[1])).toBe("A2");
  });
});

describe("divider rendering hooks", () => {
  it("renders each argument and response with its data hook", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("claim").run();
    newGroupedResponse(editor);
    editor.chain().insertContent("response").run();

    const html = editor.getHTML();
    expect(html).toContain("data-flow-argument");
    // Two responses -> two response hooks, the seam the divider CSS keys off.
    const responseHooks = html.match(/data-flow-response/g) ?? [];
    expect(responseHooks).toHaveLength(2);
  });
});

describe("live keyboard flow (keymap wins over baseline Enter)", () => {
  it("Enter fires a new argument row, Shift+Enter a grouped response", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);
    const dom = editor.view.dom;

    editor.chain().focus().insertContent("argument one").run();
    fireEvent.keyDown(dom, { key: "Enter" });
    editor.chain().insertContent("argument two").run();
    fireEvent.keyDown(dom, { key: "Enter", shiftKey: true });
    editor.chain().insertContent("response to two").run();

    const args = argumentsOf(editor);
    // Enter split into two argument rows; Shift+Enter grouped a second response
    // under the second argument (never a third top-level row).
    expect(args).toHaveLength(2);
    expect(responsesOf(args[0])).toHaveLength(1);
    expect(responsesOf(args[1])).toHaveLength(2);
    expect(textOf(args[1])).toBe("argument tworesponse to two");
  });
});

describe("argumentRowKeymap", () => {
  it("binds Enter and Shift-Enter to the row transitions", () => {
    const instance = argumentRowKeymap;
    expect(instance.name).toBe("argumentRowKeymap");
    // The extension carries only the keyboard contract (the Shorthand Engine PRD
    // hooks the same transitions later); assert both bindings are present.
    const shortcuts = instance.config.addKeyboardShortcuts?.call({
      editor: {} as Editor,
    } as never);
    expect(shortcuts).toBeTruthy();
    expect(Object.keys(shortcuts as object).sort()).toEqual([
      "Enter",
      "Shift-Enter",
    ]);
  });
});

describe("locateArgumentRows (addressability)", () => {
  it("returns each argument span with its nested response spans", async () => {
    const handle = await openFlowSheet();
    const editor = openEditor(handle);

    editor.chain().focus().insertContent("A1").run();
    newGroupedResponse(editor);
    editor.chain().insertContent("R1").run();
    newArgumentRow(editor);
    editor.chain().insertContent("A2").run();

    const doc = editor.state.doc;
    const located = locateArgumentRows(doc);

    // Cross-check against an independent walk of the document.
    const walked: { from: number; responses: number }[] = [];
    doc.forEach((node, offset) => {
      if (node.type.name !== ARGUMENT_NODE_NAME) return;
      let responses = 0;
      node.forEach((child) => {
        if (child.type.name === RESPONSE_NODE_NAME) responses += 1;
      });
      walked.push({ from: offset, responses });
    });

    expect(located).toHaveLength(2);
    expect(located.map((a) => a.from)).toEqual(walked.map((w) => w.from));
    expect(located[0].responses).toHaveLength(2);
    expect(located[1].responses).toHaveLength(1);
    // Each located span resolves to the node it claims.
    for (const arg of located) {
      expect(doc.nodeAt(arg.from)?.type.name).toBe(ARGUMENT_NODE_NAME);
      for (const response of arg.responses) {
        expect(doc.nodeAt(response.from)?.type.name).toBe(RESPONSE_NODE_NAME);
      }
    }
  });
});

describe("persistence", () => {
  it("survives a close and reopen: grouping stays addressable", async () => {
    const id = uniqueId();
    const fragment = "contention:persisted";

    {
      const handle = await openFlowSheet(id);
      const editor = openEditor(handle, fragment);
      editor.chain().focus().insertContent("framework").run();
      newGroupedResponse(editor);
      editor.chain().insertContent("we meet").run();
      newArgumentRow(editor);
      editor.chain().insertContent("counter-interp").run();
      editor.destroy();
      editors = editors.filter((e) => e !== editor);
      await handle.close();
      handles = handles.filter((h) => h !== handle);
    }

    {
      const handle = await openFlowSheet(id);
      const editor = openEditor(handle, fragment);
      const located = locateArgumentRows(editor.state.doc);
      expect(located).toHaveLength(2);
      expect(located[0].responses).toHaveLength(2);
      expect(located[1].responses).toHaveLength(1);
      const proseDoc: ProseMirrorNode = editor.state.doc;
      expect(proseDoc.textBetween(0, proseDoc.content.size, "\n", " ")).toContain(
        "counter-interp",
      );
    }
  });
});
