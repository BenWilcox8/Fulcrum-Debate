/**
 * The **drag payload transfer format** shared by the two halves of the single-card
 * drag-into-Speech-Doc pipeline.
 *
 * When a debater drags a card out of the block file and drops it into a speech
 * doc, the card is copied, run through the {@link ../speech.transformToSpeech |
 * Auto Speech engine} on the *drag* side (which has the card node types), and the
 * speech-ready block-level document-JSON is what travels on the drag's
 * `DataTransfer`. The drop side is therefore schema-agnostic: it only needs to
 * read those blocks and insert them at the drop position, never to understand a
 * card.
 *
 * This tiny module owns just the wire format - the custom MIME type and the
 * read/write/detect helpers over a `DataTransfer`. It carries **no** block-file or
 * speech-engine dependency, so both {@link ./card-drag | the drag source} and
 * {@link ./card-drop | the drop target} depend on it without coupling to each
 * other.
 */
import type { JSONContent } from "@tiptap/core";

/**
 * The custom `DataTransfer` MIME type carrying the Auto-Speech-formatted blocks of
 * a dragged card. A private, app-specific type so a card drag is unambiguously
 * distinguishable from any other drag (text, files, an internal ProseMirror
 * slice) on the drop side.
 */
export const CARD_SPEECH_DRAG_MIME = "application/x-fulcrum-card-speech";

/**
 * Writes the speech blocks (and a plain-text fallback) onto a drag's
 * `DataTransfer`. The blocks are stored under {@link CARD_SPEECH_DRAG_MIME} as
 * JSON; a `text/plain` copy is added so dropping the card onto a plain text target
 * (an external editor, a text field) still yields readable text.
 */
export function writeCardSpeechBlocks(
  dataTransfer: DataTransfer,
  blocks: JSONContent[],
): void {
  dataTransfer.setData(CARD_SPEECH_DRAG_MIME, JSON.stringify(blocks));
  const plain = blocksToPlainText(blocks);
  if (plain) dataTransfer.setData("text/plain", plain);
}

/**
 * Reads the speech blocks off a drop's `DataTransfer`, or `null` when the drag
 * carries no card-speech payload (or the payload is malformed). Never throws.
 */
export function readCardSpeechBlocks(
  dataTransfer: DataTransfer | null,
): JSONContent[] | null {
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(CARD_SPEECH_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as JSONContent[]) : null;
  } catch {
    return null;
  }
}

/**
 * Whether a drag carries a card-speech payload. Uses `DataTransfer.types` (not
 * `getData`, which browsers blank during `dragover` for security) so it works in
 * the `dragover` phase where the drop target decides whether to accept the drag.
 */
export function hasCardSpeechDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(CARD_SPEECH_DRAG_MIME);
}

/** Flatten speech blocks to plain text, one block per line (the text/plain fallback). */
function blocksToPlainText(blocks: JSONContent[]): string {
  return blocks
    .map((block) => blockText(block))
    .filter((line) => line.length > 0)
    .join("\n");
}

/** The concatenated text of a block-level document-JSON node. */
function blockText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (!node.content) return "";
  return node.content.map((child) => blockText(child)).join("");
}
