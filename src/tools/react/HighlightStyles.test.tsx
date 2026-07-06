/**
 * Tests for the live highlight-color stylesheet - the reactive half of the
 * Highlight tool's configurable color. It reads the tool's `color` setting off
 * the shared preference store and emits a scoped `mark { background-color }`
 * rule, so changing the color in Settings restyles highlighted runs live (no
 * reload). Provider-tolerant like `useFormattingProfile`/`useCardTools`: a bare
 * subtree still renders the default color.
 */
import { describe, expect, it } from "vitest";
import { act, render } from "@testing-library/react";

import {
  createPreferenceStore,
  PreferenceStoreProvider,
  type PreferenceStore,
  type SectionHandle,
} from "../../preferences";
import { toolSectionDefinition } from "../registry";
import {
  highlightCardTool,
  DEFAULT_HIGHLIGHT_COLOR,
  type HighlightToolSettings,
} from "../highlight/highlightCardTool";
import { HighlightStyles } from "./HighlightStyles";

function styleText(container: HTMLElement): string {
  return container.querySelector("style[data-highlight-tool]")?.textContent ?? "";
}

describe("HighlightStyles", () => {
  it("emits the default highlighter color with no provider", () => {
    const { container } = render(<HighlightStyles />);
    expect(styleText(container)).toContain(
      `background-color: ${DEFAULT_HIGHLIGHT_COLOR}`,
    );
  });

  it("reflects the tool's configured color and updates live when it changes", () => {
    const store: PreferenceStore = createPreferenceStore();
    const handle: SectionHandle<HighlightToolSettings> = store.registerSection(
      toolSectionDefinition(highlightCardTool),
    );

    const { container } = render(
      <PreferenceStoreProvider store={store}>
        <HighlightStyles />
      </PreferenceStoreProvider>,
    );

    expect(styleText(container)).toContain(
      `background-color: ${DEFAULT_HIGHLIGHT_COLOR}`,
    );

    // A Settings edit to the same section restyles highlighted runs live.
    act(() => handle.set("color", "cyan"));
    expect(styleText(container)).toContain("background-color: cyan");
  });
});
