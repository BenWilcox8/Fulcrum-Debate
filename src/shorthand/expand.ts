/**
 * The **expansion engine** for the Shorthand Engine PRD (slice 1/2): it rewrites
 * abbreviations in just-completed text to their full form, run *exactly at a
 * box/argument transition* - never on every keystroke.
 *
 * ## Why "at the transition", not per keystroke
 *
 * Expanding while the debater is still typing a word would fight their input
 * (the moment `aff` becomes `affirmative` mid-word is jarring and can corrupt a
 * longer token like `affs`). Instead the engine runs once, over the *completed*
 * text of the block the caret is leaving, at the surface's transition event -
 * the same Enter / Shift+Enter transition the flow argument rows already own
 * ({@link ../flow/argument-rows | argumentRowKeymap} ->
 * {@link ../flow/argument-rows.newArgumentRow | newArgumentRow} /
 * {@link ../flow/argument-rows.newGroupedResponse | newGroupedResponse}). By the
 * transition the word is finished, so a whole-token match is safe and
 * predictable.
 *
 * ## Surface-agnostic by design
 *
 * The engine operates on shared Tiptap core text (a textblock in any editor), so
 * any surface can invoke it on *its* transition event: the flow surface wraps
 * its row transitions with {@link expandThen} (wiring is the next slice), and a
 * speech-doc surface later does the same over its own split command. The engine
 * knows nothing about argument rows or the dictionary's persistence - it takes a
 * plain {@link ShorthandLookup}.
 *
 * ## Matching contract: whole-token only
 *
 * A "token" is a maximal run of Unicode letters/digits ({@link TOKEN_PATTERN}).
 * The engine looks up each whole token and replaces it only on an exact hit, so
 * a substring (`aff` inside `affluent`), a partial token (`affs`), or any
 * non-abbreviation is left untouched. Replacement is position-precise (one
 * `insertText` per matched token, applied right-to-left so earlier positions
 * stay valid), so surrounding text and its marks are never disturbed.
 */
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { ResolvedPos } from "@tiptap/pm/model";

/**
 * Resolves a whole word token to its expansion, or `undefined` for a token with
 * no expansion. The seam between the engine and the dictionary: the persisted
 * {@link ./dictionary.ShorthandDictionary.lookup | dictionary lookup} is a
 * `ShorthandLookup`, but tests (and any future in-memory source) can pass a
 * plain function.
 */
export type ShorthandLookup = (token: string) => string | undefined;

/**
 * A matched whole word token: its offset range within the scanned text plus the
 * token itself. Offsets index the concatenated text, not document positions.
 */
interface TokenMatch {
  readonly token: string;
  readonly start: number;
  readonly end: number;
}

/**
 * The token grammar: a maximal run of Unicode letters or digits. Punctuation and
 * whitespace are separators, so `aff.` tokenizes to `aff` (then `.`), and
 * `affs` stays one token that never matches `aff`.
 */
export const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;

/** Every whole word token in `text`, in order, with its offset range. */
function tokenize(text: string): TokenMatch[] {
  const matches: TokenMatch[] = [];
  // A fresh regex per call keeps `lastIndex` state local and reentrant-safe.
  const re = new RegExp(TOKEN_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    matches.push({
      token: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return matches;
}

/**
 * Pure text-level expansion: rewrites every whole word token in `text` that has
 * an expansion, leaving separators, substrings, and non-abbreviations untouched.
 * The position-agnostic core the editor-level {@link expandCompletedText} mirrors
 * - directly testable without an editor. `changed` reflects whether any token
 * actually differed from its expansion.
 */
export function expandText(
  text: string,
  lookup: ShorthandLookup,
): { text: string; changed: boolean } {
  let out = "";
  let cursor = 0;
  let changed = false;
  for (const { token, start, end } of tokenize(text)) {
    const expansion = lookup(token);
    // Copy the separator run before this token verbatim.
    out += text.slice(cursor, start);
    if (expansion !== undefined && expansion !== token) {
      out += expansion;
      changed = true;
    } else {
      out += token;
    }
    cursor = end;
  }
  out += text.slice(cursor);
  return { text: out, changed };
}

/**
 * The concatenated text of the textblock at `$pos`, plus a per-character map
 * from a text offset back to its absolute document position. `null` when `$pos`
 * is not inside a textblock (nothing to expand). Non-text inline nodes are
 * skipped, so a token can never span across one.
 */
function scanTextblock(
  state: EditorState,
  $pos: ResolvedPos,
): { text: string; positions: number[] } | null {
  const depth = $pos.depth;
  if (!$pos.parent.isTextblock) return null;
  const start = $pos.start(depth);
  const end = $pos.end(depth);

  let text = "";
  const positions: number[] = [];
  state.doc.nodesBetween(start, end, (node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i += 1) positions.push(pos + i);
      text += node.text;
    }
  });
  return { text, positions };
}

/**
 * Expands the abbreviations in the **just-completed textblock** - the block the
 * caret currently sits in - and returns whether anything changed. This is the
 * transition-triggered rewrite: a surface calls it at its Enter / Shift+Enter
 * event (see {@link expandThen}), so it runs over finished text, never
 * mid-keystroke.
 *
 * Every matched whole token is replaced in one transaction (one undo step),
 * right-to-left so earlier positions stay valid; each replacement inherits the
 * marks at its start position, so styled text is preserved. A no-op (no
 * textblock, or no token resolved to a different expansion) returns `false`
 * without dispatching.
 */
export function expandCompletedText(
  editor: Editor,
  lookup: ShorthandLookup,
): boolean {
  return editor.commands.command(({ state, tr, dispatch }) => {
    const scan = scanTextblock(state, state.selection.$from);
    if (!scan) return false;

    const replacements: { from: number; to: number; text: string }[] = [];
    for (const { token, start, end } of tokenize(scan.text)) {
      const expansion = lookup(token);
      if (expansion === undefined || expansion === token) continue;
      replacements.push({
        from: scan.positions[start],
        to: scan.positions[end - 1] + 1,
        text: expansion,
      });
    }
    if (replacements.length === 0) return false;

    if (dispatch) {
      // Right-to-left so an earlier replacement's positions are unaffected by a
      // later one changing the text length.
      for (let i = replacements.length - 1; i >= 0; i -= 1) {
        const { from, to, text } = replacements[i];
        tr.insertText(text, from, to);
      }
    }
    return true;
  });
}

/**
 * Runs shorthand expansion over the just-completed text, then invokes the
 * surface's own `transition` command - the composition seam every surface uses
 * to hook the engine onto its Enter / Shift+Enter event without the engine
 * knowing the surface.
 *
 * The flow surface passes its
 * {@link ../flow/argument-rows.newArgumentRow | newArgumentRow} /
 * {@link ../flow/argument-rows.newGroupedResponse | newGroupedResponse}; a
 * speech-doc surface later passes its own split. Returns the transition's result
 * (expansion is a best-effort side effect and never suppresses the transition).
 */
export function expandThen(
  editor: Editor,
  lookup: ShorthandLookup,
  transition: (editor: Editor) => boolean,
): boolean {
  expandCompletedText(editor, lookup);
  return transition(editor);
}
