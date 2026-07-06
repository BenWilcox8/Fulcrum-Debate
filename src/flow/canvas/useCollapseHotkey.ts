import { useEffect } from "react";

import type { FlowCollapseState } from "./useFlowCollapse";

/** The global "Collapse All Except Active" chord: Ctrl + backslash. */
export const COLLAPSE_ALL_HOTKEY_LABEL = "Ctrl+\\";

/**
 * Installs the document-wide **Ctrl+\\** hotkey that runs "Collapse All Except
 * Active" on the given collapse state. Unlike the C# contention trigger, this
 * fires regardless of the focused target - the debater's caret is *inside* the
 * active node's text surface when they reach for the chord, which is exactly the
 * node it must keep open. A `null` collapse state (document still opening) makes
 * the hotkey inert.
 */
export function useCollapseAllExceptActiveHotkey(
  collapse: FlowCollapseState | null,
): void {
  useEffect(() => {
    if (!collapse) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl+\ only - never the Meta chord, to avoid clashing with OS/browser
      // shortcuts. `event.key` is the literal backslash.
      if (event.key !== "\\" || !event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      collapse.collapseAllExceptActive();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [collapse]);
}
