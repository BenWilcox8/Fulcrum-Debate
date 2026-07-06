/**
 * Behavioral tests for the card-cutting tool registration contract - slice 1 of
 * the Card-Cutting Toolbar & Tool Customization Framework. This is the seam every
 * individual tool (Extract, Shrink, Condense, Auto Speech, Send to Block File)
 * plugs into, so the tests pin the *contract*, not any real tool's editing logic
 * (those tools land in later slices).
 *
 * They assert observable behaviour over the public seams only: registration +
 * enumeration on the registry, and settings defaults/persistence/reset over the
 * shared preference store. `fake-indexeddb/auto` + a fresh `IDBFactory` per test
 * mirrors the formatting-preferences and store-persistence tests, so the real
 * `openPreferenceStore` round-trip exercises the same local backend the app uses.
 * One end-to-end test drives a real Tiptap editor to prove `apply` operates on a
 * genuine selection with the tool's live persisted settings.
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";

import {
  createPreferenceStore,
  openPreferenceStore,
  type PersistentPreferenceStore,
  type PreferenceField,
} from "../preferences";
import { openDocumentService, type DocumentService } from "../documents/service";
import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import {
  createCardToolRegistry,
  toolSectionId,
  TOOL_SECTION_ID_PREFIX,
  type CardToolDefinition,
} from "./registry";

/**
 * A minimal recording tool: its `applyToSelection` never touches the editor, it
 * just records the editor and the settings snapshot it was handed, so a test can
 * assert exactly what the registry forwarded on invocation. The registry only
 * forwards the editor, so a bare object cast is a faithful stand-in here.
 */
function makeRecordingTool() {
  const calls: { editor: Editor; settings: { prefix: string; stepSize: number } }[] =
    [];
  const definition: CardToolDefinition<{
    prefix: PreferenceField<string>;
    stepSize: PreferenceField<number>;
  }> = {
    id: "recorder",
    label: "Recorder",
    settings: {
      prefix: { default: ">> ", label: "Prefix" },
      stepSize: { default: 2, label: "Step size" },
    },
    applyToSelection(editor, settings) {
      calls.push({ editor, settings });
      return true;
    },
  };
  return { definition, calls };
}

const stubEditor = {} as Editor;

// Track persistent stores so an async test always closes its backend.
let openStores: PersistentPreferenceStore[] = [];
async function openStore(): Promise<PersistentPreferenceStore> {
  const store = openPreferenceStore();
  openStores.push(store);
  await store.whenLoaded;
  return store;
}

let handles: DocumentHandle[] = [];
let editors: Editor[] = [];
let services: DocumentService[] = [];

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  for (const editor of editors) editor.destroy();
  editors = [];
  for (const handle of handles) await handle.close();
  handles = [];
  for (const service of services) await service.close();
  services = [];
  for (const store of openStores) await store.close();
  openStores = [];
});

describe("card tool registration", () => {
  it("registers a tool by id + label with a settings schema and returns its handle", () => {
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);
    const { definition } = makeRecordingTool();

    const tool = registry.register(definition);

    expect(tool.id).toBe("recorder");
    expect(tool.label).toBe("Recorder");
    // The declared defaults are exposed through the settings handle.
    expect(tool.settings.get("prefix")).toBe(">> ");
    expect(tool.settings.get("stepSize")).toBe(2);
    expect(tool.settings.getAll()).toEqual({ prefix: ">> ", stepSize: 2 });
  });

  it("registers the tool's settings as a namespaced section on the shared store", () => {
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);
    const { definition } = makeRecordingTool();

    const tool = registry.register(definition);

    // Namespaced so a tool id can never collide with a non-tool section id.
    expect(tool.settings.id).toBe(toolSectionId("recorder"));
    expect(toolSectionId("recorder")).toBe(`${TOOL_SECTION_ID_PREFIX}recorder`);
    expect(store.getSection(toolSectionId("recorder"))).toBe(tool.settings);
    // The section is enumerable on the store for the Settings screen.
    expect(store.listSections().map((d) => d.id)).toContain(
      toolSectionId("recorder"),
    );
    // The section carries the tool label as its title, for the settings UI.
    expect(store.getSection(toolSectionId("recorder"))?.definition.title).toBe(
      "Recorder",
    );
  });

  it("enumerates registered tools in registration order for the toolbar UI", () => {
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);

    const shrink = registry.register({
      id: "shrink",
      label: "Shrink",
      settings: { step: { default: 1 } },
      applyToSelection: () => true,
    });
    const extract = registry.register({
      id: "extract",
      label: "Extract",
      settings: { keepTag: { default: true } },
      applyToSelection: () => true,
    });

    expect(registry.list()).toEqual([shrink, extract]);
    expect(registry.list().map((t) => t.id)).toEqual(["shrink", "extract"]);
    expect(registry.get("extract")).toBe(extract);
    expect(registry.get("nope")).toBeUndefined();
  });

  it("rejects an empty id or label", () => {
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);

    expect(() =>
      registry.register({
        id: "",
        label: "X",
        settings: {},
        applyToSelection: () => true,
      }),
    ).toThrow(/id/i);
    expect(() =>
      registry.register({
        id: "x",
        label: "",
        settings: {},
        applyToSelection: () => true,
      }),
    ).toThrow(/label/i);
  });
});

describe("invoking a tool reads its live persisted settings", () => {
  it("forwards the editor and the current settings snapshot to applyToSelection", () => {
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);
    const { definition, calls } = makeRecordingTool();
    const tool = registry.register(definition);

    // Defaults first.
    expect(tool.apply(stubEditor)).toBe(true);
    expect(calls.at(-1)).toEqual({
      editor: stubEditor,
      settings: { prefix: ">> ", stepSize: 2 },
    });

    // A set value flows through on the next invocation.
    tool.settings.set("prefix", "-- ");
    tool.apply(stubEditor);
    expect(calls.at(-1)?.settings).toEqual({ prefix: "-- ", stepSize: 2 });

    // reset() drops back to the declared defaults.
    tool.settings.reset();
    tool.apply(stubEditor);
    expect(calls.at(-1)?.settings).toEqual({ prefix: ">> ", stepSize: 2 });
  });
});

describe("duplicate registration is idempotent-or-error on the id", () => {
  it("re-registering the same id + schema returns the live tool and preserves set values", () => {
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);
    const first = registry.register(makeRecordingTool().definition);
    first.settings.set("stepSize", 5);

    const second = registry.register(makeRecordingTool().definition);

    expect(second).toBe(first);
    expect(second.settings.get("stepSize")).toBe(5);
    expect(registry.list()).toEqual([first]);
  });

  it("re-registering an id with a different settings schema throws", () => {
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);
    registry.register(makeRecordingTool().definition);

    expect(() =>
      registry.register({
        id: "recorder",
        label: "Recorder",
        // Different default for the same key: a data-shape mismatch.
        settings: { prefix: { default: "!! " }, stepSize: { default: 2 } },
        applyToSelection: () => true,
      }),
    ).toThrow();
  });

  it("re-registering an id with a different label throws", () => {
    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);
    registry.register(makeRecordingTool().definition);

    expect(() =>
      registry.register({
        id: "recorder",
        label: "Renamed",
        settings: { prefix: { default: ">> " }, stepSize: { default: 2 } },
        applyToSelection: () => true,
      }),
    ).toThrow(/recorder/);
  });
});

describe("a tool's settings persist through the store and reset to defaults", () => {
  it("a set value survives a store restart; reset forgets it across a restart", async () => {
    const first = await openStore();
    const registryA = createCardToolRegistry(first);
    const toolA = registryA.register(makeRecordingTool().definition);
    toolA.settings.set("stepSize", 7);
    await first.close();

    const second = await openStore();
    const registryB = createCardToolRegistry(second);
    const toolB = registryB.register(makeRecordingTool().definition);
    expect(toolB.settings.get("stepSize")).toBe(7); // persisted override
    expect(toolB.settings.get("prefix")).toBe(">> "); // never set -> default

    toolB.settings.reset();
    await second.close();

    const third = await openStore();
    const registryC = createCardToolRegistry(third);
    const toolC = registryC.register(makeRecordingTool().definition);
    expect(toolC.settings.getAll()).toEqual({ prefix: ">> ", stepSize: 2 });
  });
});

describe("apply operates on a real Tiptap selection with live settings", () => {
  it("inserts the persisted prefix at the current selection", async () => {
    const service = openDocumentService();
    services.push(service);
    const handle = await service.create({ kind: "block-file", title: "tool-e2e" });
    handles.push(handle);
    await handle.whenLoaded;
    const editor = createEditor({
      binding: { handle, fragment: "body" },
      extensions: editorPreset(),
    });
    editors.push(editor);

    const store = createPreferenceStore();
    const registry = createCardToolRegistry(store);
    const tool = registry.register({
      id: "prefixer",
      label: "Prefixer",
      settings: { prefix: { default: "AFF: " } },
      applyToSelection: (ed, settings) =>
        ed.chain().focus().insertContent(settings.prefix).run(),
    });

    editor.commands.setContent("<p>contention</p>");
    editor.commands.focus("end");
    expect(tool.apply(editor)).toBe(true);
    expect(editor.getText()).toContain("AFF: ");

    // Editing the persisted setting changes what the next invocation inserts.
    tool.settings.set("prefix", "NEG: ");
    editor.commands.focus("end");
    tool.apply(editor);
    expect(editor.getText()).toContain("NEG: ");
  });
});
