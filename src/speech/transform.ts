/**
 * The **Auto Speech transform engine**: the pure, framework-agnostic core that
 * turns card / selection content into speech-ready form.
 *
 * When a debater finishes cutting cards they assemble a *speech* - the actual text
 * they will read aloud. A speech is not a pile of cards: it keeps each card's
 * tagline (the claim) and cite (the source), drops everything the debater did *not*
 * highlight, flattens the highlighted read-aloud text to plain readable prose, and
 * separates one card from the next so the reader can see where each piece of
 * evidence begins. This module performs exactly that transform, and nothing else.
 *
 * It is deliberately a **shared dependency**, not a private helper of one tool.
 * Three separate PRDs consume it - a clipboard toolbar tool (the next Auto Speech
 * slice), the ToC-checkbox "build a speech from the checked sections" pipeline, and
 * the drag-to-speech pipeline - so it is kept in the same documented-contract
 * discipline as the {@link ../blockfile/card-unit | card-unit API} and the
 * {@link ../editor/marks.highlightedRuns | highlighted-runs query}: pure functions
 * over ProseMirror state, **no React, no toolbar coupling, no editor mutation**.
 *
 * ## What it operates on
 *
 * The single entry point {@link transformToSpeech} takes a ProseMirror
 * {@link https://prosemirror.net/docs/ref/#model.Node | Node} - the currency of the
 * card-anatomy APIs - and returns an array of block-level document-JSON nodes (the
 * speech body). The input may be:
 *
 * - a whole block-file document (its side regions holding section headers and
 *   cards),
 * - a fragment of one (a selection's content re-parented under a node), or
 * - a single {@link ../blockfile/card | card} node.
 *
 * The engine walks that node in document order, **without descending into a card**
 * (a card is transformed as one unit via the card-anatomy regions), collecting the
 * cards and section headers it finds. Loose prose *outside* a card is not part of a
 * card's read-aloud content, so it is ignored - only cards and headers shape a
 * speech.
 *
 * ## The transform rules (per the Auto Speech PRD)
 *
 * For each card, in order, the output holds:
 *
 * 1. the **tag**, only when {@link SpeechTransformOptions.includeTag} is on (off by
 *    default - the tag is a tactical cutting label, not read aloud);
 * 2. the **tagline**, rendered **bold** (a real {@link ../editor/marks.BoldMark |
 *    bold mark}, so it is bold in the speech doc where card-region CSS does not
 *    reach) - the tagline carries no marks in a card, so the engine adds the bold;
 * 3. the **cite**;
 * 4. the **body's highlighted runs as plain readable text** - the highlighted runs
 *    are pulled with the shared {@link ../editor/marks.highlightedRuns | highlighted
 *    -runs query} and flattened to plain text (highlight/bold/font-size marks all
 *    dropped), one output paragraph per source body paragraph that has highlights,
 *    so sentence structure survives. **Un-highlighted body text is stripped
 *    entirely** - it never appears in a speech.
 *
 * Between two adjacent cards the engine inserts a **separator line**
 * ({@link SpeechTransformOptions.separator}); a **section header** between two cards
 * is itself the divider, so no extra separator is added around it. Section headers
 * are **preserved** as headings ({@link SpeechTransformOptions.includeSectionHeaders}).
 *
 * ## Configuration
 *
 * Everything above is tunable through the {@link SpeechTransformOptions} object -
 * the separator string (or `""` to disable), header handling, and which card
 * regions to emit - so the clipboard tool, the ToC pipeline, and drag-to-speech can
 * each shape the output without forking the engine.
 *
 * ## Purity / snapshot discipline
 *
 * `transformToSpeech` reads the node passed in and returns fresh document-JSON; it
 * never mutates its input and holds no state. Like every card-anatomy query, its
 * output reflects the document version it read - re-run it after edits.
 */
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { highlightedRuns, BOLD_MARK_NAME } from "../editor/marks";
import {
  CARD_NODE_NAME,
  CARD_BODY_NODE_NAME,
  readCardRegionText,
} from "../blockfile";

/** The ProseMirror node-type name Tiptap gives a heading (a section header). */
const HEADING_NODE_NAME = "heading";

/**
 * The default text of the separator line the engine puts between two adjacent
 * cards. A plain, portable string (no schema-specific divider node) so the speech
 * body drops cleanly onto a clipboard or into a speech document.
 */
export const DEFAULT_SPEECH_SEPARATOR = "---";

/**
 * How {@link transformToSpeech} shapes its output. Every field is optional; the
 * defaults encode the Auto Speech PRD's standard speech (bold tagline + cite +
 * highlighted body, cards separated, headers preserved, tag omitted).
 */
export interface SpeechTransformOptions {
  /**
   * The text of the separator paragraph inserted **between** two adjacent cards.
   * Defaults to {@link DEFAULT_SPEECH_SEPARATOR}. Pass an empty string to emit no
   * separator at all. A section header between two cards already divides them, so
   * no separator is added next to a header.
   */
  separator?: string;
  /**
   * Preserve section headers (heading nodes) found in the input as headings in the
   * output speech. Defaults to `true`. When `false`, headers are dropped and cards
   * flow together (still separated by {@link separator}).
   */
  includeSectionHeaders?: boolean;
  /**
   * Emit each card's tag as a plain line. Defaults to `false` - the tag is a
   * tactical cutting label (`[T]`, `[CP]`), not part of what is read aloud.
   */
  includeTag?: boolean;
  /**
   * Emit each card's tagline. Defaults to `true`. See {@link boldTagline} for its
   * emphasis.
   */
  includeTagline?: boolean;
  /**
   * Render the emitted tagline **bold**. Defaults to `true` (the PRD's "tagline
   * stays bold"). Only meaningful when {@link includeTagline} is on.
   */
  boldTagline?: boolean;
  /** Emit each card's cite. Defaults to `true` - a cite is read aloud as evidence. */
  includeCite?: boolean;
}

/** The fully-resolved options after defaults are applied. */
interface ResolvedOptions {
  separator: string;
  includeSectionHeaders: boolean;
  includeTag: boolean;
  includeTagline: boolean;
  boldTagline: boolean;
  includeCite: boolean;
}

function resolveOptions(options: SpeechTransformOptions): ResolvedOptions {
  return {
    separator: options.separator ?? DEFAULT_SPEECH_SEPARATOR,
    includeSectionHeaders: options.includeSectionHeaders ?? true,
    includeTag: options.includeTag ?? false,
    includeTagline: options.includeTagline ?? true,
    boldTagline: options.boldTagline ?? true,
    includeCite: options.includeCite ?? true,
  };
}

/** One item the walk collects, in document order: a card or a section header. */
type SpeechItem =
  | { kind: "card"; node: ProseMirrorNode }
  | { kind: "heading"; node: ProseMirrorNode };

/**
 * Collects the cards and section headers of `node` in document order, without
 * descending into a card (a card is transformed as one unit). Headers are only
 * collected when the caller wants them preserved.
 */
function collectItems(
  node: ProseMirrorNode,
  includeSectionHeaders: boolean,
): SpeechItem[] {
  // A node that *is* a card has no card ancestor to walk to - transform it whole.
  if (node.type.name === CARD_NODE_NAME) {
    return [{ kind: "card", node }];
  }

  const items: SpeechItem[] = [];
  node.descendants((child) => {
    if (child.type.name === CARD_NODE_NAME) {
      items.push({ kind: "card", node: child });
      return false; // never descend into a card
    }
    if (child.type.name === HEADING_NODE_NAME) {
      if (includeSectionHeaders) items.push({ kind: "heading", node: child });
      return false; // a heading holds only inline text - nothing to collect below
    }
    return true;
  });
  return items;
}

/** A plain-text run, optionally marked. */
function textNode(text: string, marks?: JSONContent["marks"]): JSONContent {
  return marks && marks.length > 0
    ? { type: "text", text, marks }
    : { type: "text", text };
}

/** A paragraph wrapping the given inline content. */
function paragraph(content: JSONContent[]): JSONContent {
  return { type: "paragraph", content };
}

/** Find a card's region child node by its schema node-type name. */
function regionNode(
  card: ProseMirrorNode,
  nodeName: string,
): ProseMirrorNode | null {
  let found: ProseMirrorNode | null = null;
  card.forEach((child) => {
    if (!found && child.type.name === nodeName) found = child;
  });
  return found;
}

/**
 * Builds the speech blocks for one card: tag (optional), bold tagline, cite, and
 * the highlighted body runs flattened to plain paragraphs (one per source body
 * paragraph that has highlights). Un-highlighted body text is dropped. Returns an
 * empty array when the card contributes nothing (no enabled region has content).
 */
function cardBlocks(
  card: ProseMirrorNode,
  options: ResolvedOptions,
): JSONContent[] {
  const blocks: JSONContent[] = [];

  if (options.includeTag) {
    const tag = readCardRegionText(card, "tag");
    if (tag) blocks.push(paragraph([textNode(tag)]));
  }
  if (options.includeTagline) {
    const tagline = readCardRegionText(card, "tagline");
    if (tagline) {
      const marks = options.boldTagline ? [{ type: BOLD_MARK_NAME }] : undefined;
      blocks.push(paragraph([textNode(tagline, marks)]));
    }
  }
  if (options.includeCite) {
    const cite = readCardRegionText(card, "cite");
    if (cite) blocks.push(paragraph([textNode(cite)]));
  }

  const body = regionNode(card, CARD_BODY_NODE_NAME);
  if (body) {
    body.forEach((sourceParagraph) => {
      const runs = highlightedRuns(sourceParagraph);
      if (runs.length === 0) return; // un-highlighted paragraph is stripped
      const text = runs
        .map((run) => run.text.trim())
        .filter(Boolean)
        .join(" ");
      if (text) blocks.push(paragraph([textNode(text)]));
    });
  }

  return blocks;
}

/** Preserve a section header as a heading, carrying its level and plain text. */
function headingBlock(heading: ProseMirrorNode): JSONContent {
  return {
    type: HEADING_NODE_NAME,
    attrs: { level: heading.attrs.level },
    content: heading.textContent
      ? [textNode(heading.textContent)]
      : [],
  };
}

/**
 * Transforms card / selection content into speech-ready block-level document-JSON.
 *
 * Walks `node` in document order (never descending into a card), and for each card
 * emits its bold tagline, cite, and highlighted body text as plain readable
 * paragraphs (un-highlighted body text stripped), preserving section headers and
 * inserting a separator line between adjacent cards. See the module overview for
 * the full rule set and {@link SpeechTransformOptions} for configuration.
 *
 * Pure: `node` is read, never mutated; the returned array is fresh document-JSON a
 * caller drops onto a clipboard or into a speech document. Positions are irrelevant
 * (the engine works structurally), so the result carries none.
 */
export function transformToSpeech(
  node: ProseMirrorNode,
  options: SpeechTransformOptions = {},
): JSONContent[] {
  const resolved = resolveOptions(options);
  const items = collectItems(node, resolved.includeSectionHeaders);

  const blocks: JSONContent[] = [];
  let previousWasCard = false;

  for (const item of items) {
    if (item.kind === "heading") {
      blocks.push(headingBlock(item.node));
      previousWasCard = false; // a header divides cards - no extra separator
      continue;
    }

    const cb = cardBlocks(item.node, resolved);
    if (cb.length === 0) continue; // an empty card is as if it were not there

    if (previousWasCard && resolved.separator) {
      blocks.push(paragraph([textNode(resolved.separator)]));
    }
    blocks.push(...cb);
    previousWasCard = true;
  }

  return blocks;
}
