import { createElement, useContext, useMemo, useState } from "react";

import {
  createPreferenceStore,
  PreferenceStoreContext,
  type PreferenceStore,
} from "../../preferences";
import {
  createCardToolRegistry,
  type CardToolDefinition,
} from "../registry";
import { CARD_TOOL_DEFINITIONS } from "../cardTools";
import { demoCardTool } from "../demo/demoCardTool";
import { condenseTool } from "../condense";
import { extractHighlightTool } from "../extract/extractHighlightTool";
import {
  SEND_TOOL_ID,
  type SendMode,
  type SendToolSettings,
} from "../send";
import { SendToBlockFileControl } from "../send/SendToBlockFileControl";
import {
  AUTO_SPEECH_TOOL_ID,
  type AutoSpeechToolSettings,
} from "../speech";
import { AutoSpeechControl } from "../speech/AutoSpeechControl";
import type { SectionHandle } from "../../preferences";
import type { ToolbarTool } from "./CardToolbar";

/**
 * The card-cutting tools the toolbar ships, in the order they render: the
 * app-level {@link CARD_TOOL_DEFINITIONS} (the single list that also drives the
 * Settings screen, so a real tool with settings - Shrink, Highlight, Send - is
 * wired into both surfaces by one addition there), then the settings-less tools
 * ({@link condenseTool}, {@link extractHighlightTool}) that are toolbar-only,
 * then the {@link demoCardTool} reference tool (retired once the real tools have
 * fully replaced it). Each real tool appends itself here (or to
 * `CARD_TOOL_DEFINITIONS` when it has settings) as it lands, and the toolbar
 * renders it with no further wiring.
 *
 * Most tools render as a plain apply-button; a tool that needs richer UI (Send's
 * destination picker) supplies a {@link ToolbarTool.renderControl}, attached
 * below when the registered tool is enumerated.
 */
const SHIPPED_CARD_TOOLS: readonly CardToolDefinition[] = [
  ...CARD_TOOL_DEFINITIONS,
  condenseTool as CardToolDefinition,
  extractHighlightTool as CardToolDefinition,
  demoCardTool as CardToolDefinition,
];

/**
 * Builds the card-tool registry over the shared {@link PreferenceStore} and
 * returns the registered tools for the toolbar to render, in registration order.
 *
 * Each tool's settings register as their own namespaced section on the store
 * (the registry's contract), so they persist and reset alongside every other
 * feature's settings and a future per-tool Settings panel gets them for free.
 *
 * ## Provider-tolerant, like the formatting feature's reader
 *
 * The block-file screen is not boot-path code, but a bare subtree (or a test)
 * may render it without a {@link PreferenceStoreProvider}. Rather than throw like
 * {@link usePreferenceStore}, this hook falls back to a private, app-lifetime
 * store when no provider is present, so the toolbar still renders its tools (they
 * simply run with default settings). The registry is memoised per store, and
 * `register` is idempotent, so re-renders never re-register or throw.
 */
export function useCardTools(): ToolbarTool[] {
  const context = useContext(PreferenceStoreContext);
  // Stable private fallback for a bare tree; created even when a provider exists
  // (hooks are unconditional) but then unused.
  const [fallback] = useState<PreferenceStore>(() => createPreferenceStore());
  const store = context?.store ?? fallback;

  return useMemo(() => {
    const registry = createCardToolRegistry(store);
    for (const definition of SHIPPED_CARD_TOOLS) registry.register(definition);
    // A few tools need richer interaction than the default apply-button and so
    // supply a custom control: Send its destination picker, and Auto Speech its
    // async clipboard copy + confirmation. Both read their live settings off the
    // store, so a Settings edit is observed on the next use.
    return registry.list().map((tool): ToolbarTool => {
      if (tool.id === SEND_TOOL_ID) {
        const settings = tool.settings as unknown as {
          get(key: keyof SendToolSettings): SendMode;
        };
        return {
          ...tool,
          renderControl: ({ editor, enabled }) =>
            createElement(SendToBlockFileControl, {
              editor,
              enabled,
              defaultMode: settings.get("defaultMode"),
              label: tool.label,
            }),
        };
      }
      if (tool.id === AUTO_SPEECH_TOOL_ID) {
        const settings =
          tool.settings as unknown as SectionHandle<AutoSpeechToolSettings>;
        return {
          ...tool,
          renderControl: ({ editor, enabled }) =>
            createElement(AutoSpeechControl, {
              editor,
              enabled,
              settings,
              label: tool.label,
            }),
        };
      }
      return tool;
    });
  }, [store]);
}
