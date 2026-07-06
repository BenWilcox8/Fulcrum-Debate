import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";

import type { DocumentHandle } from "../../documents/core";
import { CONTENTION_KIND } from "../contention";
import { getNode } from "../nodes";
import { addSubpoint } from "../subpoint";
import { stepSubpointTrigger } from "./subpoint-trigger";

/**
 * Strips a just-typed trigger token from the editor, but only when the text
 * immediately before the caret is *exactly* that token - so committing `S1`
 * removes the typed `S1` and nothing else, and a commit where the token was not
 * literally typed into the doc (e.g. under jsdom, where keydown inserts nothing)
 * is a safe no-op. The caret must be a collapsed cursor for this to apply.
 */
function stripTypedToken(editor: Editor, token: string): void {
  if (token.length === 0) return;
  const { from, empty } = editor.state.selection;
  if (!empty) return;
  const start = from - token.length;
  if (start < 0) return;
  const before = editor.state.doc.textBetween(start, from, "", "");
  if (before === token) {
    editor.chain().deleteRange({ from: start, to: from }).run();
  }
}

/**
 * Wires the pure S# trigger reducer ({@link ./subpoint-trigger}) to live
 * keystrokes *inside a contention's own editor*, so a debater can nest a subpoint
 * without a dialog: while typing in a contention, type `S1`, press Enter.
 *
 * Unlike the document-wide C# contention trigger - which fires off the canvas and
 * deliberately *ignores* editable targets - the subpoint trigger must fire from
 * **within** the contention's editable Tiptap surface (that is what "inside a
 * contention" means). It therefore listens in the **capture phase on `document`**
 * and only acts when the keystroke's target lies within *this* contention's
 * editor DOM: capturing on `document` guarantees the handler runs before
 * ProseMirror's own keydown handling, so a committed Enter can be cancelled before
 * it splits a paragraph, and the just-typed `S1` is stripped back out as the
 * nested container is born.
 *
 * Nesting is enforced by construction: the trigger only exists on a contention's
 * editor, so a subpoint can only ever be created inside a contention. The commit
 * is additionally guarded with {@link getNode} so a trigger that races the
 * contention's deletion is a no-op, never a throw. The typed buffer is a ref (it
 * must not cause re-renders) and resets whenever the routing target changes or the
 * editor loses focus, so a half-typed token never leaks.
 *
 * No-ops when there is no handle or no editor yet.
 */
export function useSubpointTrigger(
  handle: DocumentHandle | null,
  contentionId: string,
  editor: Editor | null,
): void {
  const bufferRef = useRef("");

  useEffect(() => {
    bufferRef.current = "";
    if (!handle || handle.closed || !editor) return;
    const dom = editor.view.dom;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Node | null;
      // Only respond to keystrokes aimed at this contention's own editor.
      if (!target || !dom.contains(target)) return;

      const typed = bufferRef.current;
      const { buffer, create } = stepSubpointTrigger(typed, event.key);
      bufferRef.current = buffer;
      if (create != null) {
        // Cancel the Enter before ProseMirror splits the block, and remove the
        // `S1` the debater just typed so only the nested container remains.
        event.preventDefault();
        event.stopImmediatePropagation();
        stripTypedToken(editor, typed);
        if (getNode(handle, contentionId)?.kind === CONTENTION_KIND) {
          addSubpoint(handle, contentionId);
        }
      }
    };

    const onBlur = () => {
      bufferRef.current = "";
    };

    // Capture phase on document: runs before ProseMirror's own keydown handler.
    document.addEventListener("keydown", onKeyDown, true);
    dom.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      dom.removeEventListener("blur", onBlur);
    };
  }, [handle, contentionId, editor]);
}
