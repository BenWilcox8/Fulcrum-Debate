/**
 * The **Auto Speech** clipboard card-cutting tool - slice 2 of the Auto Speech
 * PRD (the toolbar/clipboard/settings wiring around the pure engine).
 *
 * When a debater has finished cutting and highlighting cards they build a
 * *speech* - the running text they read aloud. The pure
 * {@link ../../speech.transformToSpeech | speech engine} already turns card /
 * selection content into speech-ready document-JSON (bold taglines, cites, the
 * highlighted read-aloud runs flattened to plain text, un-highlighted body
 * stripped, cards separated). This tool is the toolbar affordance around it: it
 * runs the engine over the **current selection** and puts the result on the
 * clipboard so the debater can paste it straight into their speech doc or any
 * external editor.
 *
 * ## What goes on the clipboard, and why both formats
 *
 * The payload is written as **two flavours at once**: `text/html` (rich text) and
 * `text/plain`. External editors (Word, Google Docs, a speech doc) paste the HTML
 * so the tagline stays **bold**; plain-text-only targets (a terminal, a plain
 * notes app) get readable text with one block per line. Writing both means the
 * speech pastes well everywhere, and neither format loses information the other
 * carries. The HTML is produced by serializing the engine's document-JSON through
 * the editor's own schema (so `<strong>`, `<h2>`, `<p>` come out exactly as the
 * editor would render them), and the plain text is the same blocks joined by
 * newlines.
 *
 * ## The selection the engine runs over
 *
 * {@link speechSelectionNode} resolves "the current selection" to a node the
 * engine can walk: an empty caret uses the enclosing card
 * ({@link ../../blockfile.getSelectedCard}); a range collects the whole cards and
 * section headers it intersects (never a partial card) re-parented under a
 * throwaway node - exactly the "a selection's content re-parented under a node"
 * input the engine documents. Loose prose outside a card contributes nothing (the
 * engine ignores it).
 *
 * ## Settings, observed live
 *
 * The engine's configuration ({@link ../../speech.SpeechTransformOptions}) is
 * exposed one-to-one as the tool's settings schema, so it renders on the Settings
 * screen through the generic {@link ../../settings/SchemaSettingsPanel |
 * schema-driven panel} and persists through the shared preference store. Because
 * the registry passes the tool its live settings snapshot on every invocation,
 * reconfiguring the separator or header handling in Settings is observed by the
 * next copy with no reload.
 *
 * Unlike the in-place tools, Auto Speech's real invocation gives the debater
 * *feedback that the copy happened* (an async clipboard write can fail, and a
 * silent copy is a poor affordance), so its toolbar presence is a custom control
 * ({@link ./AutoSpeechControl}) that awaits {@link copySpeechToClipboard} and
 * announces the result. {@link CardToolDefinition.applyToSelection} still performs
 * a functional copy (fire-and-forget) using the live settings, so the tool honours
 * the registry contract and is driveable programmatically.
 */
import type { Editor, JSONContent } from "@tiptap/core";
import { DOMSerializer, Fragment } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  transformToSpeech,
  DEFAULT_SPEECH_SEPARATOR,
  type SpeechTransformOptions,
} from "../../speech";
import { CARD_NODE_NAME, getSelectedCard } from "../../blockfile";
import type { PreferenceField } from "../../preferences";
import type { CardToolDefinition } from "../registry";

/** The stable registry/id + settings-section id for the Auto Speech tool. */
export const AUTO_SPEECH_TOOL_ID = "auto-speech";

/** The tool's toolbar/settings display label. */
export const AUTO_SPEECH_TOOL_LABEL = "Auto Speech";

/** The ProseMirror node-type name Tiptap gives a heading (a section header). */
const HEADING_NODE_NAME = "heading";

/**
 * The Auto Speech tool's settings schema. It mirrors the engine's
 * {@link SpeechTransformOptions} one field per option, so it renders straight from
 * its metadata on the schema-driven Settings panel and its values *are* a valid
 * options object. Boolean defaults are widened to `boolean` (the store-core
 * convention) so a user can set the other value.
 */
export type AutoSpeechToolSettings = {
  separator: PreferenceField<string>;
  includeSectionHeaders: PreferenceField<boolean>;
  includeTag: PreferenceField<boolean>;
  includeTagline: PreferenceField<boolean>;
  boldTagline: PreferenceField<boolean>;
  includeCite: PreferenceField<boolean>;
};

/** The rich-text + plain-text payload written to the clipboard. */
export interface SpeechClipboardPayload {
  /** The speech serialized as HTML (rich text), so a paste keeps the bold tagline. */
  html: string;
  /** The same speech as plain text, one block per line, for plain-text targets. */
  text: string;
  /** How many block-level nodes the speech holds (paragraphs, headings, separators). */
  blockCount: number;
}

/** The outcome of a successful clipboard copy, for the control's confirmation. */
export interface SpeechCopyResult {
  /** How many block-level nodes were copied. */
  blockCount: number;
}

/**
 * Resolves the editor's current selection to a single node the speech engine can
 * walk. An empty selection uses the card the caret is in; a range collects every
 * whole card and section header it intersects (partial cards are never sliced),
 * re-parented under a throwaway node. Returns `null` when there is no card content
 * to speak (a fresh caret in loose prose, or an empty selection outside a card).
 */
export function speechSelectionNode(editor: Editor): ProseMirrorNode | null {
  const { doc, selection } = editor.state;

  if (selection.empty) {
    const card = getSelectedCard(editor);
    return card ? card.node : null;
  }

  const items: ProseMirrorNode[] = [];
  doc.nodesBetween(selection.from, selection.to, (node) => {
    if (
      node.type.name === CARD_NODE_NAME ||
      node.type.name === HEADING_NODE_NAME
    ) {
      items.push(node);
      return false; // a card/heading is collected whole - do not descend
    }
    return true;
  });
  if (items.length === 0) {
    // The range sat entirely within one card's content without wrapping a whole
    // card node; fall back to the enclosing card.
    const card = getSelectedCard(editor);
    return card ? card.node : null;
  }

  // `create` (unlike `createChecked`) does not validate content against the doc's
  // content expression, so wrapping arbitrary collected nodes is safe - the engine
  // only walks structure, it never resolves positions against this wrapper.
  return doc.type.create(null, Fragment.fromArray(items));
}

/** Serialize the speech blocks to an HTML string through the editor's schema. */
function speechToHtml(editor: Editor, blocks: JSONContent[]): string {
  const nodes = blocks.map((block) => editor.schema.nodeFromJSON(block));
  const fragment = Fragment.fromArray(nodes);
  const dom = DOMSerializer.fromSchema(editor.schema).serializeFragment(fragment);
  const container = document.createElement("div");
  container.appendChild(dom);
  return container.innerHTML;
}

/** Flatten the speech blocks to plain text, one block per line. */
function speechToText(editor: Editor, blocks: JSONContent[]): string {
  return blocks
    .map((block) => editor.schema.nodeFromJSON(block).textContent)
    .join("\n");
}

/**
 * Builds the clipboard payload for the current selection, or `null` when the
 * selection produces no speech (no card content, or a card whose regions are all
 * empty). Pure apart from reading the editor state; performs no clipboard I/O.
 */
export function buildSpeechPayload(
  editor: Editor,
  options: SpeechTransformOptions,
): SpeechClipboardPayload | null {
  const node = speechSelectionNode(editor);
  if (!node) return null;

  const blocks = transformToSpeech(node, options);
  if (blocks.length === 0) return null;

  return {
    html: speechToHtml(editor, blocks),
    text: speechToText(editor, blocks),
    blockCount: blocks.length,
  };
}

/**
 * Writes a speech payload to the system clipboard as rich text + plain text.
 *
 * Prefers {@link https://developer.mozilla.org/docs/Web/API/ClipboardItem |
 * ClipboardItem} so both `text/html` and `text/plain` land at once (a rich target
 * pastes the HTML, a plain target the text). Falls back to `writeText` (plain text
 * only) where `ClipboardItem` is unavailable. Rejects if the clipboard write
 * fails, so a caller can surface the failure.
 */
export async function writeSpeechToClipboard(
  payload: SpeechClipboardPayload,
): Promise<void> {
  const clipboard = navigator.clipboard;
  if (typeof ClipboardItem !== "undefined" && clipboard?.write) {
    const item = new ClipboardItem({
      "text/html": new Blob([payload.html], { type: "text/html" }),
      "text/plain": new Blob([payload.text], { type: "text/plain" }),
    });
    await clipboard.write([item]);
    return;
  }
  await clipboard.writeText(payload.text);
}

/**
 * Runs the engine over the current selection and copies the result to the
 * clipboard, returning the {@link SpeechCopyResult} (or `null` when there was
 * nothing to copy, in which case no clipboard write is attempted). The awaitable
 * entry point the toolbar control uses so it can confirm the copy or surface a
 * failure.
 */
export async function copySpeechToClipboard(
  editor: Editor,
  options: SpeechTransformOptions,
): Promise<SpeechCopyResult | null> {
  const payload = buildSpeechPayload(editor, options);
  if (!payload) return null;
  await writeSpeechToClipboard(payload);
  return { blockCount: payload.blockCount };
}

/**
 * The Auto Speech tool definition. Its settings mirror the engine config; its
 * `applyToSelection` performs a functional, fire-and-forget copy using the live
 * settings (so the registry contract holds and it is driveable programmatically),
 * while the interactive toolbar presence - which also confirms the copy - is the
 * custom {@link ./AutoSpeechControl} wired in {@link ../react/useCardTools}.
 */
export const autoSpeechTool: CardToolDefinition<AutoSpeechToolSettings> = {
  id: AUTO_SPEECH_TOOL_ID,
  label: AUTO_SPEECH_TOOL_LABEL,
  description:
    "Copy the current selection as a speech: bold taglines, cites, and the " +
    "highlighted read-aloud text, ready to paste.",
  settings: {
    separator: {
      default: DEFAULT_SPEECH_SEPARATOR,
      label: "Separator between cards",
      description:
        "Line inserted between adjacent cards in the speech. Leave empty for none.",
    },
    includeSectionHeaders: {
      default: true as boolean,
      label: "Keep section headers",
      description: "Preserve argument-section headings as headings in the speech.",
    },
    includeTag: {
      default: false as boolean,
      label: "Include tag",
      description: "Emit each card's tag (a tactical cutting label). Off by default.",
    },
    includeTagline: {
      default: true as boolean,
      label: "Include tagline",
      description: "Emit each card's tagline (the claim).",
    },
    boldTagline: {
      default: true as boolean,
      label: "Bold the tagline",
      description: "Render the tagline bold in the speech.",
    },
    includeCite: {
      default: true as boolean,
      label: "Include cite",
      description: "Emit each card's cite (the source).",
    },
  },
  applyToSelection(editor, settings): boolean {
    const payload = buildSpeechPayload(editor, settings);
    if (!payload) return false;
    // Fire-and-forget: the sync apply seam cannot await the clipboard write, so
    // the copy proceeds and any failure is swallowed here (the interactive
    // control awaits and reports failures itself).
    void writeSpeechToClipboard(payload).catch(() => {});
    return true;
  },
};
