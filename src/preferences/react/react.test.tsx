import { describe, it, expect } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { type ReactNode } from "react";

import { createPreferenceStore } from "../store";
import type { PreferenceStore, SectionHandle } from "../store";
import {
  PreferenceStoreProvider,
  usePreferenceStore,
  usePreferenceValue,
  useSection,
} from ".";

/**
 * A representative feature section. Defaults are written without `as const` so
 * primitive types widen (`indent: number`, `wrap: boolean`) - a real feature
 * that needs to `set` the other boolean value widens with `as boolean`.
 */
const formattingFields = {
  indent: { default: 2, label: "Indent width" },
  wrap: { default: false as boolean, label: "Wrap lines" },
  ruler: { default: { column: 80 } as { column: number }, label: "Ruler" },
};

function registerFormatting(store: PreferenceStore) {
  return store.registerSection({ id: "formatting", fields: formattingFields });
}

/** Wraps hooks/components in a provider owning the given store. */
function withStore(store: PreferenceStore) {
  return ({ children }: { children: ReactNode }) => (
    <PreferenceStoreProvider store={store}>{children}</PreferenceStoreProvider>
  );
}

describe("useSection", () => {
  it("returns the section's typed defaults before anything is set", () => {
    const store = createPreferenceStore();
    const handle = registerFormatting(store);

    const { result } = renderHook(() => useSection(handle));

    expect(result.current).toEqual({
      indent: 2,
      wrap: false,
      ruler: { column: 80 },
    });
  });

  it("re-renders with the new snapshot when a value is set elsewhere", () => {
    const store = createPreferenceStore();
    const handle = registerFormatting(store);

    const { result } = renderHook(() => useSection(handle));
    expect(result.current.wrap).toBe(false);

    act(() => {
      handle.set("wrap", true);
    });

    expect(result.current.wrap).toBe(true);
  });

  it("re-renders back to defaults when the section is reset", () => {
    const store = createPreferenceStore();
    const handle = registerFormatting(store);
    act(() => {
      handle.set("indent", 8);
    });

    const { result } = renderHook(() => useSection(handle));
    expect(result.current.indent).toBe(8);

    act(() => {
      handle.reset();
    });

    expect(result.current.indent).toBe(2);
  });

  it("keeps a stable snapshot reference between notifications", () => {
    const store = createPreferenceStore();
    const handle = registerFormatting(store);

    const { result, rerender } = renderHook(() => useSection(handle));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("stops updating after the consumer unmounts", () => {
    const store = createPreferenceStore();
    const handle = registerFormatting(store);

    const { result, unmount } = renderHook(() => useSection(handle));
    unmount();

    // Setting after unmount must neither throw nor be observed.
    expect(() => act(() => handle.set("wrap", true))).not.toThrow();
    expect(result.current.wrap).toBe(false);
  });
});

describe("usePreferenceValue", () => {
  it("reads a single typed key and updates when it changes", () => {
    const store = createPreferenceStore();
    const handle = registerFormatting(store);

    const { result } = renderHook(() => usePreferenceValue(handle, "indent"));
    expect(result.current).toBe(2);

    act(() => {
      handle.set("indent", 4);
    });

    expect(result.current).toBe(4);
  });
});

describe("PreferenceStoreProvider / usePreferenceStore", () => {
  it("shares one store instance across the tree", () => {
    const store = createPreferenceStore();

    const { result } = renderHook(() => usePreferenceStore(), {
      wrapper: withStore(store),
    });

    expect(result.current).toBe(store);
  });

  it("creates a store of its own when none is passed", () => {
    const { result } = renderHook(() => usePreferenceStore(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <PreferenceStoreProvider>{children}</PreferenceStoreProvider>
      ),
    });

    expect(result.current.listSections()).toEqual([]);
  });

  it("throws when used outside a provider", () => {
    expect(() => renderHook(() => usePreferenceStore())).toThrow(
      /must be used within a PreferenceStoreProvider/,
    );
  });

  it("drives a live reactive read for a section registered through it", () => {
    const store = createPreferenceStore();
    const handle: SectionHandle<typeof formattingFields> =
      registerFormatting(store);

    function Reader() {
      const { wrap } = useSection(handle);
      return <span data-testid="wrap">{String(wrap)}</span>;
    }

    render(
      <PreferenceStoreProvider store={store}>
        <Reader />
      </PreferenceStoreProvider>,
    );

    expect(screen.getByTestId("wrap")).toHaveTextContent("false");

    act(() => {
      handle.set("wrap", true);
    });

    expect(screen.getByTestId("wrap")).toHaveTextContent("true");
  });
});
