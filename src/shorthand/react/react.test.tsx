/**
 * Tests for the shorthand React bindings that wire the scope gate onto a surface's
 * editor:
 *
 *  - `useShorthandDictionary` hands back the provided lookup, or `null` on a bare
 *    tree (provider-tolerant);
 *  - `useShorthandScope` reads the live scope off the shared store and re-renders
 *    on a change, defaulting to `"both"` with no provider;
 *  - `useSurfaceShorthand` pushes the correct `{ lookup, enabled }` runtime onto an
 *    editor for its surface - the end-to-end proof that **the scope preference
 *    gates the flow surface** and that the gate is surface-generic (the same hook,
 *    a different surface key, produces the right verdict).
 */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { type ReactNode } from "react";
import type { Editor } from "@tiptap/core";

import {
  createPreferenceStore,
  PreferenceStoreProvider,
  type PreferenceStore,
} from "../../preferences";
import { openDocument, type DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import { argumentRowExtensions } from "../../flow/argument-rows";
import type { ShorthandLookup } from "../expand";
import { getShorthandRuntime, shorthandRuntimeExtension } from "../runtime";
import {
  SHORTHAND_SCOPE_KEY,
  registerShorthandSection,
} from "../preferences";
import { ShorthandDictionaryContext } from "./ShorthandDictionaryContext";
import { useShorthandDictionary } from "./useShorthandDictionary";
import { useShorthandScope } from "./useShorthandScope";
import { useSurfaceShorthand } from "./useSurfaceShorthand";

const lookup: ShorthandLookup = (t) => (t === "aff" ? "affirmative" : undefined);

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
async function openFlowEditor(): Promise<Editor> {
  const handle = openDocument({
    id: `flow-${Date.now()}-${nextId++}`,
    kind: "flow-sheet",
  });
  await handle.whenLoaded;
  handles.push(handle);
  const editor = createEditor({
    binding: { handle, fragment: "contention:test" },
    extensions: editorPreset({
      extensions: [...argumentRowExtensions, shorthandRuntimeExtension],
    }),
  });
  editors.push(editor);
  return editor;
}

/** A wrapper providing both the store (scope) and a dictionary lookup. */
function withProviders(
  store: PreferenceStore,
  dictLookup: ShorthandLookup | null = lookup,
) {
  return ({ children }: { children: ReactNode }) => (
    <PreferenceStoreProvider store={store}>
      {dictLookup ? (
        <ShorthandDictionaryContext.Provider value={{ lookup: dictLookup }}>
          {children}
        </ShorthandDictionaryContext.Provider>
      ) : (
        children
      )}
    </PreferenceStoreProvider>
  );
}

describe("useShorthandDictionary", () => {
  it("returns null on a bare tree", () => {
    const { result } = renderHook(() => useShorthandDictionary());
    expect(result.current).toBeNull();
  });

  it("returns the provided lookup within a provider", () => {
    const { result } = renderHook(() => useShorthandDictionary(), {
      wrapper: ({ children }) => (
        <ShorthandDictionaryContext.Provider value={{ lookup }}>
          {children}
        </ShorthandDictionaryContext.Provider>
      ),
    });
    expect(result.current).toBe(lookup);
  });
});

describe("useShorthandScope", () => {
  it("defaults to 'both' with no provider", () => {
    const { result } = renderHook(() => useShorthandScope());
    expect(result.current).toBe("both");
  });

  it("reads the live scope and re-renders when it changes", () => {
    const store = createPreferenceStore();
    const handle = registerShorthandSection(store);
    const { result } = renderHook(() => useShorthandScope(), {
      wrapper: withProviders(store),
    });
    expect(result.current).toBe("both");

    act(() => handle.set(SHORTHAND_SCOPE_KEY, "neither"));
    expect(result.current).toBe("neither");
  });
});

describe("useSurfaceShorthand (scope gates the surface)", () => {
  it("enables the flow surface and wires the lookup under the default scope", async () => {
    const editor = await openFlowEditor();
    const store = createPreferenceStore();

    renderHook(() => useSurfaceShorthand(editor, "flow"), {
      wrapper: withProviders(store),
    });

    const runtime = getShorthandRuntime(editor);
    expect(runtime.enabled).toBe(true); // 'both' enables flow
    expect(runtime.lookup).toBe(lookup);
  });

  it("disables the flow surface when the scope excludes it ('speech'), live", async () => {
    const editor = await openFlowEditor();
    const store = createPreferenceStore();
    const handle = registerShorthandSection(store);

    renderHook(() => useSurfaceShorthand(editor, "flow"), {
      wrapper: withProviders(store),
    });
    expect(getShorthandRuntime(editor).enabled).toBe(true);

    act(() => handle.set(SHORTHAND_SCOPE_KEY, "speech"));
    expect(getShorthandRuntime(editor).enabled).toBe(false);

    act(() => handle.set(SHORTHAND_SCOPE_KEY, "neither"));
    expect(getShorthandRuntime(editor).enabled).toBe(false);

    act(() => handle.set(SHORTHAND_SCOPE_KEY, "flow"));
    expect(getShorthandRuntime(editor).enabled).toBe(true);
  });

  it("is surface-generic: the same 'speech' scope enables a speech surface", async () => {
    const editor = await openFlowEditor();
    const store = createPreferenceStore();
    const handle = registerShorthandSection(store);
    act(() => handle.set(SHORTHAND_SCOPE_KEY, "speech"));

    renderHook(() => useSurfaceShorthand(editor, "speech"), {
      wrapper: withProviders(store),
    });

    // Same hook, a different surface key: 'speech' scope enables the speech surface
    // while (per the test above) it disables the flow surface.
    expect(getShorthandRuntime(editor).enabled).toBe(true);
  });

  it("is provider-tolerant: no dictionary means expansion cannot run", async () => {
    const editor = await openFlowEditor();
    const store = createPreferenceStore();

    renderHook(() => useSurfaceShorthand(editor, "flow"), {
      wrapper: withProviders(store, null),
    });

    const runtime = getShorthandRuntime(editor);
    expect(runtime.enabled).toBe(true); // scope enables it...
    expect(runtime.lookup).toBeNull(); // ...but there is no lookup, so nothing expands
  });
});
