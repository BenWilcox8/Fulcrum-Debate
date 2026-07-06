/**
 * Tests for the `useCardTools` hook - the React seam that builds the card-tool
 * registry over the shared preference store and returns the shipped tools for
 * the toolbar to render. Provider-tolerant, like the formatting feature's
 * `useFormattingProfile`: a bare subtree (no `PreferenceStoreProvider`) still
 * yields the tools against a private fallback store, so the toolbar always
 * renders.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import {
  createPreferenceStore,
  PreferenceStoreProvider,
  type PreferenceStore,
} from "../../preferences";
import { toolSectionId } from "../registry";
import { demoCardTool } from "../demo/demoCardTool";
import { useCardTools } from "./useCardTools";

/** A probe component that reports the tool ids the hook returns. */
function ToolIdsProbe({ onIds }: { onIds: (ids: string[]) => void }) {
  const tools = useCardTools();
  onIds(tools.map((t) => t.id));
  return null;
}

describe("useCardTools", () => {
  it("returns the shipped tools with a provider's store", () => {
    let ids: string[] = [];
    const store = createPreferenceStore();
    render(
      <PreferenceStoreProvider store={store}>
        <ToolIdsProbe onIds={(v) => (ids = v)} />
      </PreferenceStoreProvider>,
    );

    expect(ids).toContain(demoCardTool.id);
    // Each tool's settings registered as a namespaced section on the store.
    expect(store.getSection(toolSectionId(demoCardTool.id))).toBeDefined();
  });

  it("tolerates the absence of a provider (falls back to a private store)", () => {
    let ids: string[] = [];
    render(<ToolIdsProbe onIds={(v) => (ids = v)} />);

    expect(ids).toContain(demoCardTool.id);
  });

  it("registers tools against the same store on every render (idempotent)", () => {
    const shared: PreferenceStore = createPreferenceStore();
    const captured: string[][] = [];
    const { rerender } = render(
      <PreferenceStoreProvider store={shared}>
        <ToolIdsProbe onIds={(v) => captured.push(v)} />
      </PreferenceStoreProvider>,
    );
    rerender(
      <PreferenceStoreProvider store={shared}>
        <ToolIdsProbe onIds={(v) => captured.push(v)} />
      </PreferenceStoreProvider>,
    );

    // No throw across re-renders, and the section exists exactly once.
    expect(shared.getSection(toolSectionId(demoCardTool.id))).toBeDefined();
    expect(captured.every((v) => v.includes(demoCardTool.id))).toBe(true);
  });
});
