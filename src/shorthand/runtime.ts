/**
 * The **surface-generic editor seam** that lets any Tiptap surface run shorthand
 * expansion on its own transition without threading the dictionary or the scope
 * preference through its editor construction.
 *
 * ## The problem this solves
 *
 * The engine's {@link ./expand.expandThen | expandThen} needs a live
 * {@link ShorthandLookup} and the surface needs to know, per keystroke, whether
 * expansion is currently *enabled* for it (the scope gate can change at any time in
 * Settings). But a surface's editor is built once from a **stable** preset (the
 * flow surface deliberately shares one module-level preset reference so editors are
 * not rebuilt), so the lookup/enabled pair cannot be baked into the preset.
 *
 * ## The mechanism: live runtime on editor storage
 *
 * {@link shorthandRuntimeExtension} declares a `shorthand` slot on `editor.storage`
 * holding a {@link ShorthandRuntime} (`{ lookup, enabled }`), defaulting to
 * disabled. A React binding ({@link ../react/useSurfaceShorthand}) pushes the live
 * values into that slot as they change, and the surface's transition keymap reads
 * them *at keystroke time* via {@link expandTransition}. The editor stays stable;
 * the runtime updates in place.
 *
 * ## Surface-generic
 *
 * Nothing here mentions the flow surface or argument rows. A surface installs
 * {@link shorthandRuntimeExtension} in its editor and wraps *its own* transition
 * command with {@link expandTransition}; the flow surface does exactly this (see
 * `src/flow/canvas/flow-shorthand-keymap`), and a speech-doc surface later does the
 * same with its own split.
 */
import { Extension, type Editor } from "@tiptap/core";

import { expandThen, type ShorthandLookup } from "./expand";

/** The `editor.storage` key under which the live runtime lives. */
export const SHORTHAND_STORAGE_KEY = "shorthand";

/**
 * The live shorthand state a surface's editor carries: the dictionary lookup to
 * expand against (or `null` when no dictionary is available) and whether expansion
 * is currently enabled for this surface (the scope gate's verdict). Read fresh at
 * each transition, so both fields may change over the editor's life.
 */
export interface ShorthandRuntime {
  /** The dictionary lookup, or `null` when no dictionary is wired. */
  readonly lookup: ShorthandLookup | null;
  /** Whether expansion is enabled for this surface right now (the scope gate). */
  readonly enabled: boolean;
}

/** The disabled default runtime an editor carries until a binding pushes one. */
const DISABLED_RUNTIME: ShorthandRuntime = { lookup: null, enabled: false };

/**
 * A no-behaviour extension that only declares the `shorthand` storage slot (so
 * {@link expandTransition} always finds a well-formed, disabled-by-default runtime
 * even before a React binding pushes live values). Install it in any surface's
 * editor that wants shorthand expansion.
 */
export const shorthandRuntimeExtension: Extension = Extension.create({
  name: SHORTHAND_STORAGE_KEY,
  addStorage(): ShorthandRuntime {
    return DISABLED_RUNTIME;
  },
});

/**
 * The editor's storage as a plain string-keyed record. Tiptap types
 * `editor.storage` as a fixed `Storage` interface, so accessing an extension's own
 * slot by its dynamic name needs this widening (the slot is declared by
 * {@link shorthandRuntimeExtension}'s `addStorage`).
 */
function storageOf(editor: Editor): Record<string, unknown> {
  return editor.storage as unknown as Record<string, unknown>;
}

/** Reads the live runtime off an editor (the disabled default if unset). */
export function getShorthandRuntime(editor: Editor): ShorthandRuntime {
  return (
    (storageOf(editor)[SHORTHAND_STORAGE_KEY] as ShorthandRuntime | undefined) ??
    DISABLED_RUNTIME
  );
}

/**
 * Pushes the live runtime onto an editor's storage. Called by the React binding as
 * the dictionary lookup or the scope-gated enablement changes; the surface's keymap
 * reads it at the next transition.
 */
export function setShorthandRuntime(
  editor: Editor,
  runtime: ShorthandRuntime,
): void {
  storageOf(editor)[SHORTHAND_STORAGE_KEY] = runtime;
}

/**
 * Runs a surface transition, expanding the just-completed text first **only when
 * the editor's live runtime enables it** (scope gate on, and a lookup present).
 * Otherwise it runs the transition unchanged. This is the one call a surface's
 * transition keymap makes; it composes the engine's {@link expandThen} seam with
 * the runtime, so the surface never re-derives expansion or the gate.
 *
 * `transition` is the surface's own split command (e.g. the flow's `newArgumentRow`
 * / `newGroupedResponse`); its boolean result is returned verbatim, so expansion
 * never suppresses or alters the transition's own outcome.
 */
export function expandTransition(
  editor: Editor,
  transition: (editor: Editor) => boolean,
): boolean {
  const { lookup, enabled } = getShorthandRuntime(editor);
  if (enabled && lookup) {
    return expandThen(editor, lookup, transition);
  }
  return transition(editor);
}
