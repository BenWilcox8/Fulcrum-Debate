/**
 * The **unformatted-text shrink rule**: the standing rule that any text run which
 * matches *none* of the named formatting styles adopts the profile's configured
 * shrink size (the standard 8pt).
 *
 * A debater's card body is a two-tier thing: the runs they will read aloud are
 * {@link ../editor/marks | highlighted} and stay at reading size, while everything
 * they did *not* highlight is shrunk to a small size so the eye skips it. That
 * small size is the {@link ./profile | profile}'s `unformatted` target. This
 * module is the pure classification of which runs are unformatted, plus the thin
 * command that drops the shrink size onto them.
 *
 * ## What counts as "unformatted"
 *
 * The five {@link FormattingTargetKey formatting targets} split into four *named*
 * styles - `tag`, `cite`, `body`, `highlight` - and the catch-all `unformatted`.
 * A run matches a named style when its position or marks claim it:
 *
 * - a run in the {@link ../blockfile/card | card tag region} -> `tag`;
 * - a run in the cite region -> `cite`;
 * - a run in the tagline region -> `body` (the tagline inherits body styling and
 *   is not a separately-standardised target);
 * - a run in the body region that carries the **highlight** mark -> `highlight`.
 *
 * Everything else matches no named style and is therefore `unformatted`: an
 * un-highlighted run inside a card body (the common case - the text a debater
 * skips), and any loose prose outside a card. Those are the runs the shrink rule
 * drives down to the configured size.
 *
 * Classification is deliberately a function of **structure and marks only**, never
 * of the run's current size - the rule must decide what a run *should* be sized at
 * from its meaning, not from whatever size it happens to carry, or it would be
 * circular.
 *
 * ## Sharing the font-size mark model
 *
 * The shrink size is applied as the same addressable `textStyle` + `fontSize` mark
 * that {@link ../editor/marks | src/editor/marks} owns and the Shrink tool cycles,
 * so a shrunk run is queryable document data (not scraped CSS) and the size model
 * stays consistent across the feature. The configured size is written verbatim, so
 * a profile may standardise an off-scale shrink size; the closed
 * `FONT_SIZE_SCALE` is the *stepping* scale for the interactive Shrink tool (a
 * later feature) and is intentionally not imposed here.
 *
 * This slice is the standing default only - it does not implement the interactive
 * Shrink tool's progressive size cycling.
 */
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { HIGHLIGHT_MARK_NAME } from "../editor/marks";
import {
  CARD_TAG_NODE_NAME,
  CARD_TAGLINE_NODE_NAME,
  CARD_CITE_NODE_NAME,
  CARD_BODY_NODE_NAME,
} from "../blockfile/card";
import {
  DEFAULT_FORMATTING_PROFILE,
  type FormattingProfile,
  type FormattingTargetKey,
} from "./profile";

/** The catch-all classification: a run matching none of the named styles. */
export const UNFORMATTED_TARGET_KEY: FormattingTargetKey = "unformatted";

/**
 * The card-region node types that map directly to a named style regardless of
 * marks (the body region is handled separately, since its style depends on the
 * highlight mark).
 */
const REGION_TARGET: Readonly<Record<string, FormattingTargetKey>> = {
  [CARD_TAG_NODE_NAME]: "tag",
  [CARD_TAGLINE_NODE_NAME]: "body",
  [CARD_CITE_NODE_NAME]: "cite",
};

/** Every card-region node type, for the enclosing-region ancestor walk. */
const REGION_NODE_NAMES: ReadonlySet<string> = new Set([
  ...Object.keys(REGION_TARGET),
  CARD_BODY_NODE_NAME,
]);

/**
 * One classified text run: a `[from, to)` range and the formatting target its
 * structure/marks resolve to. Positions are valid only against the document
 * version they were read from - re-derive after any edit.
 */
export interface ClassifiedRun {
  /** Position immediately before the run's first character. */
  from: number;
  /** Position immediately after the run's last character. */
  to: number;
  /** The formatting target this run matches (`"unformatted"` if none). */
  classification: FormattingTargetKey;
}

/** The node type name of the nearest enclosing card region of `pos`, or null. */
function enclosingRegionName(
  doc: ProseMirrorNode,
  pos: number,
): string | null {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const name = $pos.node(depth).type.name;
    if (REGION_NODE_NAMES.has(name)) return name;
  }
  return null;
}

/** Whether a text node carries the highlight mark. */
function isHighlighted(node: ProseMirrorNode): boolean {
  return node.marks.some((mark) => mark.type.name === HIGHLIGHT_MARK_NAME);
}

/**
 * Classifies a single text node given the name of its nearest enclosing card
 * region (or null when it is not inside a card).
 */
function classifyTextNode(
  node: ProseMirrorNode,
  regionName: string | null,
): FormattingTargetKey {
  if (regionName === CARD_BODY_NODE_NAME) {
    return isHighlighted(node) ? "highlight" : UNFORMATTED_TARGET_KEY;
  }
  if (regionName !== null) {
    return REGION_TARGET[regionName] ?? UNFORMATTED_TARGET_KEY;
  }
  return UNFORMATTED_TARGET_KEY;
}

/**
 * Classifies every text run in the document into its formatting target.
 *
 * A pure read over `state`: it walks the document text nodes in order, resolves
 * each run's named style from its enclosing card region and highlight mark, and
 * merges adjacent runs that share a classification. Returns the runs in document
 * order; empty (text-free) regions contribute nothing.
 */
export function classifyRuns(state: EditorState): ClassifiedRun[] {
  const runs: ClassifiedRun[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const region = enclosingRegionName(state.doc, pos);
    const classification = classifyTextNode(node, region);
    const to = pos + node.nodeSize;
    const previous = runs[runs.length - 1];
    if (previous && previous.to === pos && previous.classification === classification) {
      previous.to = to;
    } else {
      runs.push({ from: pos, to, classification });
    }
    return false;
  });
  return runs;
}

/**
 * Classifies the text run at `pos` (the run whose range contains the position),
 * or `null` when no text sits there (e.g. a boundary or an empty region). A pure
 * convenience for a single position; uses a dedicated early-exit walk rather than
 * building the full {@link classifyRuns} list.
 */
export function classifyRunAt(
  state: EditorState,
  pos: number,
): FormattingTargetKey | null {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const parentOffset = $pos.parentOffset;
  const parentStart = $pos.start();
  let childOffset = 0;
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.child(i);
    const childEnd = childOffset + child.nodeSize;
    if (child.isText && childOffset <= parentOffset && parentOffset < childEnd) {
      const nodePos = parentStart + childOffset;
      const region = enclosingRegionName(state.doc, nodePos);
      return classifyTextNode(child, region);
    }
    childOffset = childEnd;
  }
  return null;
}

/**
 * The configured shrink size: the `unformatted` target's font size from
 * `profile` (defaults to the standard 8pt). This is the CSS point string written
 * onto shrunk runs, and the size the Shrink tool cycles toward.
 */
export function shrinkSize(
  profile: FormattingProfile = DEFAULT_FORMATTING_PROFILE,
): string {
  return profile.unformatted.fontSize;
}

/** Reads the `fontSize` attribute off a text node's `textStyle` mark, or null. */
function textFontSize(state: EditorState, node: ProseMirrorNode): string | null {
  const textStyle = state.schema.marks.textStyle;
  if (!textStyle) return null;
  const mark = node.marks.find((m) => m.type.name === textStyle.name);
  const value = mark?.attrs.fontSize;
  return typeof value === "string" ? value : null;
}

/** Whether any text in `[from, to)` is not already at `size`. */
function rangeNeedsSize(
  state: EditorState,
  from: number,
  to: number,
  size: string,
): boolean {
  let needs = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && textFontSize(state, node) !== size) needs = true;
  });
  return needs;
}

/**
 * Applies the standing shrink rule: sets every unformatted run to the profile's
 * configured shrink size, as the shared `textStyle`/`fontSize` mark. Named-style
 * runs (tag/cite/body/highlight) are left untouched.
 *
 * Idempotent: runs already at the shrink size are skipped, so re-applying (or
 * applying when there is nothing to shrink) is a no-op that returns `false`.
 * Returns whether the document changed. The prior cursor or text-range selection
 * is restored (a NodeSelection is coerced to a text range).
 */
export function applyShrinkRule(
  editor: Editor,
  profile: FormattingProfile = DEFAULT_FORMATTING_PROFILE,
): boolean {
  const size = shrinkSize(profile);
  const { state } = editor;
  const targets = classifyRuns(state).filter(
    (run) =>
      run.classification === UNFORMATTED_TARGET_KEY &&
      rangeNeedsSize(state, run.from, run.to, size),
  );
  if (targets.length === 0) return false;

  const original = { from: state.selection.from, to: state.selection.to };
  const chain = editor.chain();
  for (const run of targets) {
    chain.setTextSelection({ from: run.from, to: run.to }).setFontSize(size);
  }
  return chain.setTextSelection(original).run();
}
