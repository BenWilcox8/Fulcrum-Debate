/**
 * The canonical shared extension preset for Fulcrum Debate editors.
 *
 * The {@link ../core/editor-core.createEditor | editor core} is deliberately
 * minimal: it always installs the baseline schema (document / paragraph / text)
 * and the Yjs collaboration binding, and nothing else. Every *shared formatting
 * capability* - bold, highlight, addressable font size, and headings - lives in
 * its own module so it can be built, tested, and reasoned about in isolation.
 *
 * This module is where those independent pieces are composed into the one bundle
 * feature editors instantiate. Instead of each feature (block file, card editor,
 * speech doc) re-listing `BoldMark`, `HighlightMark`, `fontSizeExtensions`, and
 * `heading` - and risking drift in which marks or heading range they enable -
 * they call {@link editorPreset} and get the agreed shared surface. A feature
 * layers its own extensions and tweaks on top through
 * {@link EditorPresetOptions}.
 *
 * ## What the preset includes
 *
 * In `extensions` order (baseline first, supplied by `createEditor`, then these):
 *
 * - {@link BoldMark} - the `bold` mark (visual emphasis).
 * - {@link HighlightMark} - the `highlight` mark (read-aloud flag, single-color).
 * - {@link fontSizeExtensions} - the `textStyle` + `fontSize` addressable size
 *   mark and the scale helpers operate on it.
 * - The {@link heading} node for the full {@link HEADING_LEVELS | 1-6} range,
 *   unless a caller narrows it via {@link EditorPresetOptions.headingLevels}.
 *
 * It does **not** add a `History`/undo extension: the baseline collaboration
 * binding already owns undo through Yjs, and a second history stack would
 * conflict (see the {@link ../core | editor core} notes).
 *
 * ## What the preset is not
 *
 * This is the extension bundle only - no React, no toolbar, no keymaps, no
 * collaboration cursors. The React editor primitive that mounts an editable
 * surface with this preset lives in {@link ../react | src/editor/react}.
 */
import type { Extensions } from "@tiptap/core";

import { BoldMark } from "./marks/bold";
import { HighlightMark } from "./marks/highlight";
import { fontSizeExtensions } from "./marks/font-size";
import { heading, type HeadingLevel } from "./headings";

/** Feature-specific configuration of the shared {@link editorPreset}. */
export interface EditorPresetOptions {
  /**
   * The heading levels to enable, a subset of {@link HEADING_LEVELS}. Defaults
   * to the full 1-6 range. A feature that only wants, say, two heading tiers
   * passes `[1, 2]`; the persisted `level` attribute is unaffected, so narrowing
   * here only limits which levels the commands/UI offer, not what older
   * documents may already contain.
   *
   * Order does not matter and duplicates are ignored; an empty array is treated
   * as "use the default full range" rather than "no headings", so headings are
   * always present in the shared schema.
   */
  headingLevels?: readonly HeadingLevel[];
  /**
   * Extra extensions layered on top of the shared preset. Feature editors add
   * their own marks, nodes, or plugins here. Do not pass a `History`/undo
   * extension - Yjs owns undo (see the module notes).
   */
  extensions?: Extensions;
}

/**
 * Builds the shared editor extension list: the agreed marks and headings, plus
 * any feature additions, ready to hand to
 * {@link ../core/editor-core.createEditor | createEditor}'s `extensions`.
 *
 * ```ts
 * const editor = createEditor({
 *   binding: { handle, fragment: "body" },
 *   extensions: editorPreset(),
 * });
 * ```
 *
 * The returned array does not include the baseline document/paragraph/text or
 * the collaboration binding - `createEditor` always installs those - so this is
 * exactly the shared *formatting* layer plus a feature's own additions.
 */
export function editorPreset(options: EditorPresetOptions = {}): Extensions {
  const { headingLevels, extensions = [] } = options;

  const headingExtension =
    headingLevels && headingLevels.length > 0
      ? heading.configure({ levels: [...new Set(headingLevels)] })
      : heading;

  return [
    BoldMark,
    HighlightMark,
    ...fontSizeExtensions,
    headingExtension,
    ...extensions,
  ];
}

export { HEADING_LEVELS, type HeadingLevel } from "./headings";
