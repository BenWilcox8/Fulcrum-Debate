import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";

import type { DocumentHandle } from "../../documents/core";
import { createEditor } from "../../editor/core";
import { editorPreset } from "../../editor/preset";
import { migrateFlowNodeFragment } from "../argument-rows";
import { FLOW_ARGUMENT_PRESET } from "./flow-argument-preset";

/**
 * Creates a Tiptap editor for a flow-node text surface (contention or subpoint),
 * running {@link migrateFlowNodeFragment} before the editor binds to the fragment
 * so legacy bare-paragraph content is wrapped into the current argument-row
 * schema before y-tiptap reads it.
 *
 * Returns `null` until the handle is present and locally loaded. Lifecycle mirrors
 * {@link useDocumentEditor}: one editor per handle+fragment, rebuilt when either
 * changes, destroyed on unmount.
 */
export function useFlowNodeEditor(
  handle: DocumentHandle | null | undefined,
  fragment: string,
): Editor | null {
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    if (!handle || handle.closed) {
      setEditor(null);
      return;
    }

    let active = true;
    let created: Editor | null = null;

    void handle.whenLoaded.then(() => {
      if (!active || handle.closed) return;
      migrateFlowNodeFragment(handle.doc, handle.doc.getXmlFragment(fragment));
      created = createEditor({
        binding: { handle, fragment },
        extensions: editorPreset(FLOW_ARGUMENT_PRESET),
      });
      setEditor(created);
    });

    return () => {
      active = false;
      created?.destroy();
      created = null;
      setEditor(null);
    };
  }, [handle, fragment]);

  return editor;
}
