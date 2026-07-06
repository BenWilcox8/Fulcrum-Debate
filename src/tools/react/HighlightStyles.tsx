import { useContext, useMemo, useState } from "react";

import {
  createPreferenceStore,
  useSection,
  PreferenceStoreContext,
  type PreferenceStore,
} from "../../preferences";
import { toolSectionDefinition } from "../registry";
import {
  highlightCardTool,
  highlightColorCss,
  HIGHLIGHT_TOOL_SCOPE,
} from "../highlight/highlightCardTool";

/**
 * Reads the Highlight tool's live `color` setting off the shared preference
 * store, re-rendering whenever it is edited - the reactive read that lets the
 * highlighter color update live without a reload.
 *
 * It registers the tool's section on first use (idempotent, so it composes with
 * the toolbar's `useCardTools`, which registers the same section) and subscribes
 * through the store's own `useSection` seam.
 *
 * ## Provider-tolerant, like the formatting reader
 *
 * A bare subtree (or a test) may render without a {@link PreferenceStoreProvider}.
 * Rather than throw like {@link usePreferenceStore}, this hook falls back to a
 * private, app-lifetime store so the default color still renders. The fallback is
 * created once (a lazy initializer) so hooks stay unconditional and its reference
 * is stable.
 */
function useHighlightColor(): string {
  const context = useContext(PreferenceStoreContext);
  const [fallback] = useState<PreferenceStore>(() => createPreferenceStore());
  const store = context?.store ?? fallback;

  const handle = useMemo(
    () => store.registerSection(toolSectionDefinition(highlightCardTool)),
    [store],
  );
  return useSection(handle).color;
}

/** Props for {@link HighlightStyles}. */
export interface HighlightStylesProps {
  /**
   * The container selector the emitted rule is scoped under. Defaults to the
   * block file's editor surface class ({@link HIGHLIGHT_TOOL_SCOPE}).
   */
  scope?: string;
}

/**
 * Mounts the live highlighter-color stylesheet: it reads the Highlight tool's
 * configured color off the shared preference store and renders it as a scoped
 * `mark { background-color }` rule in a `<style>` element, so every highlighted
 * (read-aloud) run paints in the chosen color.
 *
 * Because it reads through {@link useHighlightColor}, editing the color in
 * Settings re-renders this component and rewrites the `<style>` in place - the
 * open document restyles live, with no reload. With no preference-store provider
 * it emits the default color, so highlights always render.
 *
 * Render it once anywhere inside the editor screen's subtree (a `<style>` is
 * valid in flow content); the scoped rule finds the `<mark>` runs wherever they
 * are.
 */
export function HighlightStyles({
  scope = HIGHLIGHT_TOOL_SCOPE,
}: HighlightStylesProps = {}) {
  const color = useHighlightColor();
  const css = useMemo(() => highlightColorCss(color, scope), [color, scope]);
  return <style data-highlight-tool="">{css}</style>;
}
