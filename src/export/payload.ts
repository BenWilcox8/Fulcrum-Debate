/**
 * **Payload assembly** - turning a document surface into an {@link ExportPayload}
 * whose formatting is preserved, once, in every representation a target might
 * need.
 *
 * Assembly is per surface because the two surfaces have different schemas: the
 * speech doc is plain rich text over the shared preset, the block file adds the
 * card node model. Each wrapper opens a **short-lived headless editor** over the
 * document handle's fragment with that surface's schema (the same
 * {@link ../blockfile/toc-speech.appendBlocksToSpeechBody | headless-editor}
 * pattern the ToC pipeline uses), serializes, and destroys it. This decouples
 * export from whichever live editor happens to be mounted (the speech doc editor
 * is owned by `DocumentEditor`, the docked copy converges via Yjs) - export reads
 * only the handle, so it works whether or not the surface is being edited.
 *
 * The rendering is done through the editor's own {@link DOMSerializer}, so the
 * shared marks come out as the exact semantic HTML the editor renders
 * (`<strong>` for bold, `<mark>` for highlight, `<h1>` for a heading). That HTML
 * needs no app stylesheet to read as formatted, which is what makes it
 * *email-friendly*. The plain-text form is the same content flattened with block
 * boundaries preserved, for a mailto draft or any plain-text transport.
 */
import type { Editor } from "@tiptap/core";
import { DOMSerializer } from "@tiptap/pm/model";

import type { DocumentHandle } from "../documents/core";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { HEADING_LEVELS } from "../editor/headings";
import {
  BLOCK_FILE_FRAGMENT,
  blockFileExtensions,
  cardExtensions,
} from "../blockfile";
import { SPEECH_DOC_BODY_FRAGMENT } from "../speech-doc/speech-doc";
import type { ExportPayload } from "./target";

/** Fallback subjects when a surface has no document title. */
const SPEECH_DOC_FALLBACK_SUBJECT = "Speech";
const BLOCK_FILE_FALLBACK_SUBJECT = "Block File";

/** Escapes the five HTML-significant characters for safe interpolation into markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serializes the editor's whole document to an HTML *body* fragment through the
 * editor's own schema, so every mark renders as the semantic HTML the editor
 * would produce.
 */
function documentBodyHtml(editor: Editor): string {
  const { schema, state } = editor;
  const dom = DOMSerializer.fromSchema(schema).serializeFragment(
    state.doc.content,
  );
  const container = document.createElement("div");
  container.appendChild(dom);
  return container.innerHTML;
}

/**
 * Wraps a serialized body in a complete, email-friendly HTML document. A
 * `<meta charset>` and a readable default `font-family` are the only styling -
 * the formatting itself rides the semantic tags, so the document renders
 * correctly in any HTML mail client without the app's stylesheet.
 */
function emailHtmlDocument(subject: string, bodyHtml: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>${escapeHtml(subject)}</title></head>` +
    `<body style="font-family:Calibri,Arial,sans-serif;color:#0f172a">` +
    bodyHtml +
    `</body></html>`
  );
}

/**
 * Flattens the editor's document to plain text with block structure preserved:
 * ProseMirror's `textBetween` inserts a blank line between block nodes, so
 * headings, paragraphs, and card regions read as separate lines rather than one
 * run-on string.
 */
function documentText(editor: Editor): string {
  const { state } = editor;
  return state.doc.textBetween(0, state.doc.content.size, "\n\n", " ").trim();
}

/**
 * Assembles an {@link ExportPayload} from a live editor: the whole document
 * rendered to email-friendly HTML and to structure-preserving plain text, under
 * the given subject. The generic core both surface wrappers build on; also usable
 * directly by a caller that already holds an editor.
 */
export function buildExportPayload(
  editor: Editor,
  subject: string,
): ExportPayload {
  return {
    subject,
    html: emailHtmlDocument(subject, documentBodyHtml(editor)),
    text: documentText(editor),
  };
}

/**
 * Assembles the export payload for a **speech doc** from its document handle,
 * using a short-lived headless editor over the shared preset (bold, highlight,
 * font size, headings - so a bold tagline survives). `title` names the subject,
 * falling back to `"Speech"`.
 */
export function buildSpeechDocExportPayload(
  handle: DocumentHandle,
  title?: string | null,
): ExportPayload {
  const editor = createEditor({
    binding: { handle, fragment: SPEECH_DOC_BODY_FRAGMENT },
    extensions: editorPreset(),
  });
  try {
    return buildExportPayload(editor, title?.trim() || SPEECH_DOC_FALLBACK_SUBJECT);
  } finally {
    editor.destroy();
  }
}

/**
 * Assembles the export payload for the **block file** from its document handle,
 * using a short-lived headless editor with the block-file schema and card node
 * model installed (so the card anatomy and its body marks serialize). `title`
 * names the subject, falling back to `"Block File"`.
 */
export function buildBlockFileExportPayload(
  handle: DocumentHandle,
  title?: string | null,
): ExportPayload {
  const editor = createEditor({
    binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
    extensions: editorPreset({
      extensions: [...blockFileExtensions, ...cardExtensions],
      headingLevels: HEADING_LEVELS,
    }),
  });
  try {
    return buildExportPayload(
      editor,
      title?.trim() || BLOCK_FILE_FALLBACK_SUBJECT,
    );
  } finally {
    editor.destroy();
  }
}
