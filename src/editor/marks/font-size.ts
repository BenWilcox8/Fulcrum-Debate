/**
 * The addressable font-size mark for the Fulcrum Debate editor.
 *
 * Font size in this editor is **not** a bare inline style - it is a real,
 * queryable mark, because the product's formatting tools operate on it
 * programmatically. The card-cutting **Shrink** tool and the formatting
 * standards read the size present on a selection and cycle selections through a
 * known scale; both need to *address* size as document data, not scrape it out
 * of a rendered `style="font-size:..."` string.
 *
 * ## Design: the upstream `textStyle` mark + a `fontSize` attribute
 *
 * Rather than invent a bespoke mark, this module builds on Tiptap's own
 * {@link https://tiptap.dev/api/marks/text-style `textStyle`} mark and its
 * `FontSize` attribute extension (both from `@tiptap/extension-text-style`).
 * That choice is deliberate:
 *
 * - **It is a mark, so it is queryable.** A size set on a run appears in the
 *   document JSON as `marks: [{ type: "textStyle", attrs: { fontSize: "11pt" }}]`.
 *   The Shrink tool and standards tooling read `attrs.fontSize` directly off the
 *   document model - never by parsing inline CSS.
 * - **`textStyle` is the canonical carrier for text-run styling** in Tiptap
 *   (font family, color, ... all ride the same mark). Owning `fontSize` on it
 *   keeps a single addressable mark for run-level typography instead of a
 *   parallel bespoke one. The bold / highlight marks built in parallel are
 *   genuinely separate marks (`bold`, `highlight`), so there is no collision.
 * - **The unset/default case is first-class.** Text with no `fontSize` attribute
 *   renders at the surface's default size; {@link readFontSizes} reports that run
 *   as {@link UNSET_FONT_SIZE} (`null`), so "default-size text" is a value the
 *   tools can reason about, distinct from an explicit size.
 *
 * ## The scale is the single source of truth
 *
 * Sizes are a **discrete, ordered scale** ({@link FONT_SIZE_SCALE}), not
 * arbitrary floats: the standards tooling cycles a *known* set of steps, and a
 * closed scale is what makes "increase / decrease / cycle" well-defined. The
 * scale lives here and nowhere else; every helper derives from it.
 *
 * ## Mixed selections have defined behavior
 *
 * A selection can span runs of different sizes (and unset runs). Both read and
 * step are defined for that case:
 *
 * - **Read** ({@link readFontSizes}) reports *every* distinct size present,
 *   ordered smallest-to-largest with the unset/default run (if any) first. It
 *   never collapses a mixed selection to a single "winner".
 * - **Step** ({@link stepFontSizes}) normalizes *each run independently* against
 *   the scale: every run moves one step in the requested direction from its own
 *   current position, so their relative order is preserved. An unset run is
 *   anchored at {@link DEFAULT_FONT_SIZE}'s position before stepping; an
 *   off-scale size snaps to its nearest scale step first. This keeps a two-tier
 *   card (large highlighted text over small unhighlighted text) two-tier as the
 *   whole selection is shrunk or grown.
 *
 * This module is marks + helpers only: no toolbar, no React, no Shrink logic.
 */
import { TextStyle, FontSize as FontSizeExtension } from "@tiptap/extension-text-style";
import type { Editor, Extensions } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

/**
 * The discrete, ordered font-size scale, ascending. This is the *only* place the
 * scale is defined; all stepping and snapping derive from it.
 *
 * Values are CSS point strings so they drop straight into the `textStyle` mark's
 * `fontSize` attribute and render verbatim. Points (not pixels) match how debate
 * card formatting is specified.
 */
export const FONT_SIZE_SCALE = [
  "8pt",
  "9pt",
  "10pt",
  "11pt",
  "12pt",
  "14pt",
] as const;

/** A concrete size drawn from {@link FONT_SIZE_SCALE}. */
export type FontSize = (typeof FONT_SIZE_SCALE)[number];

/**
 * The size a run with no explicit `fontSize` mark is treated as when stepping.
 * Must be a member of {@link FONT_SIZE_SCALE}. Stepping an unset run anchors it
 * here first, so "increase default text" produces a concrete size one step up.
 */
export const DEFAULT_FONT_SIZE: FontSize = "11pt";

/**
 * The value {@link readFontSizes} uses for a run that carries no `fontSize` mark
 * - i.e. text rendered at the surface's default size. Distinct from any explicit
 * scale value.
 */
export const UNSET_FONT_SIZE = null;

/** A size present in a selection: a concrete scale value, or the unset default. */
export type FontSizeValue = FontSize | typeof UNSET_FONT_SIZE;

/** Direction to move a selection through {@link FONT_SIZE_SCALE}. */
export type FontSizeStep = "increase" | "decrease";

/**
 * The Tiptap extensions that install the addressable font-size mark. Add these
 * to {@link createEditor}'s `extensions` so `setFontSize` and the helpers below
 * work: `createEditor({ binding, extensions: fontSizeExtensions })`.
 *
 * `TextStyle` is the mark; `FontSize` layers the `fontSize` attribute and its
 * `setFontSize` / `unsetFontSize` commands onto it. Order matters - the
 * attribute extension needs the mark it decorates to be registered first.
 */
export const fontSizeExtensions: Extensions = [TextStyle, FontSizeExtension];

const isFontSize = (value: string): value is FontSize =>
  (FONT_SIZE_SCALE as readonly string[]).includes(value);

/** Parses the leading numeric magnitude of a size string (e.g. "11pt" -> 11). */
const magnitude = (size: string): number | null => {
  const parsed = Number.parseFloat(size);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The scale index a size occupies when stepping: exact members map to their
 * index, `null`/unset and unparseable sizes anchor at {@link DEFAULT_FONT_SIZE},
 * and any other (off-scale) size snaps to the nearest step by point magnitude.
 */
const scaleIndex = (size: FontSizeValue): number => {
  const defaultIndex = FONT_SIZE_SCALE.indexOf(DEFAULT_FONT_SIZE);
  if (size === UNSET_FONT_SIZE) return defaultIndex;
  if (isFontSize(size)) return FONT_SIZE_SCALE.indexOf(size);

  const target = magnitude(size);
  if (target === null) return defaultIndex;

  let nearest = defaultIndex;
  let bestDistance = Infinity;
  FONT_SIZE_SCALE.forEach((candidate, index) => {
    const value = magnitude(candidate);
    if (value === null) return;
    const distance = Math.abs(value - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = index;
    }
  });
  return nearest;
};

/**
 * The size one step from `current` in `direction`. `wrap` controls the ends:
 * clamped (default) stays put at the extremes; wrapped cycles largest->smallest
 * and back. Always returns a concrete scale value - stepping never lands on
 * unset, since an unset run is anchored to {@link DEFAULT_FONT_SIZE} first.
 */
const steppedSize = (
  current: FontSizeValue,
  direction: FontSizeStep,
  wrap: boolean,
): FontSize => {
  const delta = direction === "increase" ? 1 : -1;
  const from = scaleIndex(current);
  const last = FONT_SIZE_SCALE.length - 1;
  const next = wrap
    ? (from + delta + FONT_SIZE_SCALE.length) % FONT_SIZE_SCALE.length
    : Math.min(Math.max(from + delta, 0), last);
  return FONT_SIZE_SCALE[next];
};

/** Reads the `fontSize` attribute off a ProseMirror text node's marks. */
const fontSizeOfMarks = (
  state: EditorState,
  marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[],
): FontSizeValue => {
  const markType = state.schema.marks.textStyle;
  if (!markType) return UNSET_FONT_SIZE;
  const mark = marks.find((m) => m.type.name === markType.name);
  const value = mark?.attrs.fontSize;
  return typeof value === "string" ? (value as FontSizeValue) : UNSET_FONT_SIZE;
};

/** A contiguous run of one size within the current selection. */
interface FontSizeRun {
  from: number;
  to: number;
  size: FontSizeValue;
}

/**
 * Splits the current selection into contiguous runs by size. Adjacent text with
 * the same size (including adjacent unset text) merges into one run. Returns an
 * empty array for a collapsed (cursor) selection - callers handle that case via
 * stored marks.
 */
const selectionRuns = (state: EditorState): FontSizeRun[] => {
  const { from, to, empty } = state.selection;
  if (empty) return [];

  const runs: FontSizeRun[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (end <= start) return;

    const size = fontSizeOfMarks(state, node.marks);
    const previous = runs[runs.length - 1];
    if (previous && previous.to === start && previous.size === size) {
      previous.to = end;
    } else {
      runs.push({ from: start, to: end, size });
    }
  });
  return runs;
};

/** The size at a collapsed cursor: stored marks if any, else the marks there. */
const cursorSize = (state: EditorState): FontSizeValue => {
  const marks = state.storedMarks ?? state.selection.$from.marks();
  return fontSizeOfMarks(state, marks);
};

/**
 * Sets a concrete size on the current selection, as an addressable `textStyle`
 * mark. `size` must be a member of {@link FONT_SIZE_SCALE}; passing anything else
 * throws, so callers cannot smuggle an off-scale float past the discrete scale.
 *
 * On a collapsed selection this sets the stored mark, so text typed next carries
 * the size. Returns whether the command applied.
 */
export function setFontSize(editor: Editor, size: FontSize): boolean {
  if (!isFontSize(size)) {
    throw new Error(
      `setFontSize: ${JSON.stringify(size)} is not in FONT_SIZE_SCALE`,
    );
  }
  return editor.chain().focus().setFontSize(size).run();
}

/**
 * Clears the `fontSize` mark from the current selection, returning those runs to
 * the surface's default size (the {@link UNSET_FONT_SIZE} state). Returns whether
 * the command applied.
 */
export function unsetFontSize(editor: Editor): boolean {
  return editor.chain().focus().unsetFontSize().run();
}

/**
 * Reports every distinct size present in the current selection.
 *
 * The result is ordered smallest-to-largest by the scale, with the unset/default
 * run (if any) first as {@link UNSET_FONT_SIZE} (`null`). A uniform selection
 * yields a single element; a mixed selection yields one element per distinct size
 * present - it is never collapsed to a single "active" size. A collapsed cursor
 * reports the single size that typed text would take there.
 *
 * Off-scale sizes (e.g. from pasted content) are reported verbatim, not snapped -
 * reading is faithful; only stepping normalizes.
 */
export function readFontSizes(editor: Editor): FontSizeValue[] {
  const { state } = editor;
  const present = new Set<FontSizeValue>();

  if (state.selection.empty) {
    present.add(cursorSize(state));
  } else {
    for (const run of selectionRuns(state)) present.add(run.size);
    // A selection with no text nodes at all (e.g. an empty document) still has a
    // meaningful default: report it as unset rather than an empty result.
    if (present.size === 0) present.add(UNSET_FONT_SIZE);
  }

  return [...present].sort((a, b) => {
    if (a === UNSET_FONT_SIZE) return b === UNSET_FONT_SIZE ? 0 : -1;
    if (b === UNSET_FONT_SIZE) return 1;
    const am = magnitude(a) ?? Infinity;
    const bm = magnitude(b) ?? Infinity;
    return am - bm;
  });
}

/**
 * Moves the current selection one step through {@link FONT_SIZE_SCALE}.
 *
 * Every run in the selection is normalized *independently*: each moves one step
 * in `direction` from its own current size, so a mixed selection keeps its
 * relative size tiers. Unset runs anchor at {@link DEFAULT_FONT_SIZE}; off-scale
 * sizes snap to their nearest step first. After stepping, every touched run
 * carries a concrete addressable size.
 *
 * `wrap` controls the extremes: `false` (default) clamps - the smallest can't go
 * lower, the largest can't go higher; `true` cycles largest->smallest and back,
 * which is the "cycle" affordance. A collapsed cursor steps its stored mark.
 *
 * Returns whether anything changed.
 */
export function stepFontSizes(
  editor: Editor,
  direction: FontSizeStep,
  { wrap = false }: { wrap?: boolean } = {},
): boolean {
  const { state } = editor;

  if (state.selection.empty) {
    const current = cursorSize(state);
    const target = steppedSize(current, direction, wrap);
    if (target === current) return false;
    return setFontSize(editor, target);
  }

  const runs = selectionRuns(state);
  if (runs.length === 0) return false;

  const original = { from: state.selection.from, to: state.selection.to };
  const chain = editor.chain().focus();
  let changed = false;

  for (const run of runs) {
    const target = steppedSize(run.size, direction, wrap);
    if (target === run.size) continue; // clamped no-op for this run
    chain.setTextSelection(run).setFontSize(target);
    changed = true;
  }

  if (!changed) return false;
  return chain.setTextSelection(original).run();
}

/**
 * Convenience: increase the selection's size one step (clamped at the top of the
 * scale). See {@link stepFontSizes}.
 */
export const increaseFontSize = (editor: Editor): boolean =>
  stepFontSizes(editor, "increase");

/**
 * Convenience: decrease the selection's size one step (clamped at the bottom of
 * the scale). See {@link stepFontSizes}.
 */
export const decreaseFontSize = (editor: Editor): boolean =>
  stepFontSizes(editor, "decrease");

/**
 * Convenience: cycle the selection's size up one step, wrapping the largest back
 * to the smallest. This is the round-trip affordance the standards tooling uses.
 * See {@link stepFontSizes}.
 */
export const cycleFontSize = (editor: Editor): boolean =>
  stepFontSizes(editor, "increase", { wrap: true });
