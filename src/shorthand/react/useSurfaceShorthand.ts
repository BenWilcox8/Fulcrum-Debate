import { useEffect } from "react";
import type { Editor } from "@tiptap/core";

import { isShorthandEnabledForSurface, type ShorthandSurface } from "../scope";
import { setShorthandRuntime } from "../runtime";
import { useShorthandDictionary } from "./useShorthandDictionary";
import { useShorthandScope } from "./useShorthandScope";

/**
 * Wires shorthand expansion onto one editor for a named surface: it reads the live
 * dictionary lookup and the configured scope, decides (via
 * {@link isShorthandEnabledForSurface}) whether expansion is enabled for
 * `surface`, and pushes that runtime onto the editor's storage so the surface's
 * transition keymap ({@link ../runtime.expandTransition}) expands only when it
 * should.
 *
 * **Surface-generic**: the flow surface calls this with `"flow"`; a speech-doc
 * surface later calls the identical hook with `"speech"`. Nothing here is
 * flow-specific - the surface identity is the only per-surface input, so a new
 * surface adopts scope-gated expansion with one call and no engine change.
 *
 * The editor must install {@link ../runtime.shorthandRuntimeExtension} (its preset
 * declares the storage slot). Re-runs whenever the editor, lookup, or scope-gated
 * enablement changes, keeping the runtime live across a Settings edit or an editor
 * rebuild.
 */
export function useSurfaceShorthand(
  editor: Editor | null,
  surface: ShorthandSurface,
): void {
  const lookup = useShorthandDictionary();
  const scope = useShorthandScope();
  const enabled = isShorthandEnabledForSurface(scope, surface);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    setShorthandRuntime(editor, { lookup, enabled });
  }, [editor, lookup, enabled]);
}
