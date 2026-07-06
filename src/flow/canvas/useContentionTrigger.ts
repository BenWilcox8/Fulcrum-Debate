import { useEffect, useRef } from "react";

import type { DocumentHandle } from "../../documents/core";
import { addContention } from "../contention";
import { getColumn } from "../columns";
import { stepContentionTrigger } from "./contention-trigger";

/**
 * Wires the pure C# trigger reducer ({@link ./contention-trigger}) to live
 * keystrokes so a debater can drop a contention into the active column without a
 * dialog: focus a column, type `C1`, press Enter.
 *
 * While a column is active it listens on the document for keystrokes, buffering
 * the typed token and, on a committed `C#`, creating a contention in that column
 * via {@link addContention}. The listener is deliberately document-wide (the flow
 * sheet is a full-surface, keyboard-first workspace) but **ignores keystrokes
 * aimed at an editable target** - an `<input>`, `<textarea>`, or a
 * `contenteditable` (the column-label editor, and crucially a contention's own
 * Tiptap surface) - so typing *into* a contention never spawns another one.
 *
 * No-ops when there is no handle or no active column, so nothing fires until a
 * debater has chosen where the trigger should land. The typed buffer is kept in
 * a ref (not state): it must not cause re-renders, and it resets whenever the
 * active column changes so a half-typed token never leaks across columns.
 */
export function useContentionTrigger(
  handle: DocumentHandle | null,
  activeColumnId: string | null,
): void {
  const bufferRef = useRef("");

  useEffect(() => {
    // Reset the token whenever the routing target changes (or clears).
    bufferRef.current = "";
    if (!handle || handle.closed || !activeColumnId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never hijack typing that belongs to an editable surface.
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }
      const { buffer, create } = stepContentionTrigger(
        bufferRef.current,
        event.key,
      );
      bufferRef.current = buffer;
      if (create != null) {
        event.preventDefault();
        if (getColumn(handle, activeColumnId) !== undefined) {
          addContention(handle, activeColumnId);
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handle, activeColumnId]);
}
