/**
 * Tests for the reactive card-formatting rendering layer.
 *
 * `useFormattingProfile` reads the live merged formatting profile off the shared
 * preference store (registering the formatting section on first use) and
 * re-renders when it changes; `CardFormattingStyles` emits the profile as scoped
 * CSS into a `<style>` element. Together they satisfy the "editing the profile
 * changes rendering live without reload" acceptance. The layer also degrades to
 * the standard profile when rendered with no preference-store provider, so a
 * card still renders correctly on a bare tree.
 */
import { describe, it, expect } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { type ReactNode } from "react";

import {
  createPreferenceStore,
  PreferenceStoreProvider,
  type PreferenceStore,
} from "../../preferences";
import {
  DEFAULT_FORMATTING_PROFILE,
  registerFormattingSection,
} from "..";
import { CardFormattingStyles, useFormattingProfile } from ".";

function withStore(store: PreferenceStore) {
  return ({ children }: { children: ReactNode }) => (
    <PreferenceStoreProvider store={store}>{children}</PreferenceStoreProvider>
  );
}

describe("useFormattingProfile", () => {
  it("returns the standard profile from a fresh store", () => {
    const store = createPreferenceStore();
    const { result } = renderHook(() => useFormattingProfile(), {
      wrapper: withStore(store),
    });
    expect(result.current).toEqual(DEFAULT_FORMATTING_PROFILE);
  });

  it("re-renders live when a target is edited elsewhere", () => {
    const store = createPreferenceStore();
    const handle = registerFormattingSection(store);

    const { result } = renderHook(() => useFormattingProfile(), {
      wrapper: withStore(store),
    });
    expect(result.current.body.fontSize).toBe("12pt");

    act(() => {
      handle.set("body", {
        ...DEFAULT_FORMATTING_PROFILE.body,
        fontSize: "18pt",
      });
    });

    expect(result.current.body.fontSize).toBe("18pt");
  });

  it("degrades to the standard profile with no provider", () => {
    const { result } = renderHook(() => useFormattingProfile());
    expect(result.current).toEqual(DEFAULT_FORMATTING_PROFILE);
  });
});

describe("CardFormattingStyles", () => {
  it("emits the standard profile as scoped CSS", () => {
    const store = createPreferenceStore();
    const { container } = render(<CardFormattingStyles />, {
      wrapper: withStore(store),
    });
    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain(
      '.block-file-editor [data-card-region="tag"]',
    );
    expect(style!.textContent).toContain("font-size: 13pt");
    expect(style!.textContent).toContain("text-decoration: underline");
  });

  it("updates the emitted CSS live when the profile changes", () => {
    const store = createPreferenceStore();
    const handle = registerFormattingSection(store);

    const { container } = render(<CardFormattingStyles />, {
      wrapper: withStore(store),
    });
    const style = () => container.querySelector("style")!.textContent ?? "";
    expect(style()).toContain("font-size: 12pt");

    act(() => {
      handle.set("body", {
        ...DEFAULT_FORMATTING_PROFILE.body,
        fontSize: "20pt",
      });
    });

    expect(style()).toContain("font-size: 20pt");
  });

  it("renders standard CSS with no provider (offline-safe default)", () => {
    const { container } = render(<CardFormattingStyles />);
    const style = container.querySelector("style");
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("font-size: 13pt");
  });
});
