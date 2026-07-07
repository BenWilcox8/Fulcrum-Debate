/**
 * The card node model: a debate *card* as first-class structured content inside a
 * block-file side region.
 *
 * A card is the atomic unit of evidence a debater cuts and reads. In this product
 * it is not a free-form blob of prose but a small, fixed anatomy of four regions,
 * modelled directly in the ProseMirror schema (the same discipline the block-file
 * {@link ./schema | side division} uses - structure enforced by the schema, not by
 * convention):
 *
 * 1. **tag** ({@link cardTag}) - a short, bracketed *tactical* label the debater
 *    types as free-form shorthand (`[T]`, `[NU]`, `[CP]`, ...). It is deliberately
 *    **not** a fixed enum: the region accepts any short token, and the brackets are
 *    structural chrome the node renders around whatever token is typed.
 * 2. **tagline** ({@link cardTagline}) - a single-line claim/argument summary,
 *    styled with emphasis.
 * 3. **cite** ({@link cardCite}) - a single-line, source-first citation with the
 *    author's credentials (which a debater conventionally writes in brackets):
 *    `Smith 24 [Prof of Climate, MIT]`.
 * 4. **body** ({@link cardBody}) - the card's prose, the run(s) of text the card is
 *    cut from. This is the only region that carries formatting marks, so the shared
 *    {@link ../editor/marks | bold and highlight marks} apply here - independently
 *    and simultaneously on the same run (bold = visual emphasis, highlight =
 *    read-aloud), exactly as the marks layer already guarantees.
 *
 * ## The design: one container node with four fixed child region nodes
 *
 * {@link card} is a single block-group node whose content expression is exactly
 * `"cardTag cardTagline cardCite cardBody"` - one of each region, in that order,
 * and nothing else. As with the side division, encoding the anatomy in the content
 * expression means ProseMirror *enforces* it on every transaction for free: a card
 * can never be missing a region, have two of one, have them out of order, or hold
 * stray content between them. Auto-fill guarantees a freshly inserted card already
 * has all four regions (the text regions empty, the body backfilled with an empty
 * paragraph), so a card is immediately editable.
 *
 * ### Why distinct region node types rather than one node with a `role` attribute
 *
 * Encoding each region in its *node type* lets the single `card` content
 * expression pin down identity, order, and cardinality in one place, and lets each
 * region carry its own content rule - the three header regions are plain
 * single-line text (`text*`, marks disabled), while only the body holds block prose
 * with marks. A one-node-with-attribute design could express none of that in the
 * schema and would need a plugin to repair it after the fact.
 *
 * ### Region content rules
 *
 * - **tag / tagline / cite** are `content: "text*"` with `marks: ""` - plain,
 *   single-line text with no marks. `text*` (no paragraph, no hard break) is what
 *   makes them structurally single-line; disabling marks keeps these label/citation
 *   regions to their one purpose (the tagline's emphasis and the tag's brackets are
 *   presentation, below - not marks a user toggles).
 * - **body** is `content: "paragraph+"` - block prose. Formatting lives on the text
 *   runs as {@link ../editor/marks | marks} (bold/highlight/font-size), not as block
 *   types, so paragraphs are all the body needs; restricting to `paragraph+` (rather
 *   than `block+`) also keeps cards from nesting inside a card body and keeps
 *   headings - the block file's argument-section delimiter - out of a card. A future
 *   PRD that genuinely needs richer body blocks makes that a deliberate, contained
 *   schema change.
 *
 * ### Not in the `block` group
 *
 * Only {@link card} is in the `block` group, so a card can appear wherever block
 * content is allowed - i.e. inside a side region (`block+`) or an argument section.
 * The four region nodes are deliberately left *out* of every group and are only
 * reachable by name from the card's content expression, so they can never appear on
 * their own inside a section, and a region can never nest inside another region.
 *
 * ## Rendering: brackets and side hooks are structure + data attributes, no CSS
 *
 * Like the side sections, this module ships **no CSS**. Each region serializes to an
 * element carrying `data-card-region="tag|tagline|cite|body"` - the stable hook a
 * later styling PR keys card styling off (e.g. the tagline's emphasis). The tag
 * additionally renders literal `[` and `]` text around a `data-card-tag-token`
 * span that holds the editable token, so the token is *stored bare* (free-form, no
 * brackets in the document text) yet always *renders bracketed*; `contentElement`
 * points HTML parsing back at that inner span so the brackets are never re-absorbed
 * as content on a round-trip.
 *
 * ## How a feature editor installs this
 *
 * The card nodes layer onto a block-file editor through the same shared-preset
 * feature-extension seam as the side schema - append {@link cardExtensions} and
 * {@link ./card-create.cardCreate | cardCreate} after
 * {@link ./schema.blockFileExtensions | blockFileExtensions}:
 *
 * ```ts
 * const editor = createEditor({
 *   binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
 *   extensions: editorPreset({
 *     extensions: [...blockFileExtensions, ...cardExtensions, cardCreate],
 *   }),
 * });
 * ```
 *
 * This slice ships the schema/model and a pure {@link buildCardContent} JSON
 * builder only. The card-unit addressability API is a sibling follow-up slice
 * that builds on these node types; the card-cutting tools come later. No
 * `History` extension is added here - undo continues to flow through the
 * collaboration binding's Yjs history.
 */
import { Node, type JSONContent } from "@tiptap/core";

/**
 * The ProseMirror / document-JSON node-type name of the card container.
 *
 * This name is a schema contract sibling slices read (the addressability API and
 * quick-create UI locate cards by this type, the card-cutting tools produce it), so
 * treat it as fixed: never rename it without a coordinated migration of persisted
 * documents.
 */
export const CARD_NODE_NAME = "card";

/** Node-type name of the card's bracketed tactical-tag region. Fixed schema contract. */
export const CARD_TAG_NODE_NAME = "cardTag";

/** Node-type name of the card's single-line tagline region. Fixed schema contract. */
export const CARD_TAGLINE_NODE_NAME = "cardTagline";

/** Node-type name of the card's single-line cite region. Fixed schema contract. */
export const CARD_CITE_NODE_NAME = "cardCite";

/** Node-type name of the card's prose body region. Fixed schema contract. */
export const CARD_BODY_NODE_NAME = "cardBody";

/** Shared configuration for the three single-line text header regions. */
const textRegionConfig = {
  // Plain, single-line text: `text*` admits only text leaves (no paragraph, no
  // hard break), which is what structurally constrains each of these regions to a
  // single line.
  content: "text*",
  // No marks: these are label/citation regions, not formatted prose. The tagline's
  // emphasis and the tag's brackets are presentation, not user-toggled marks.
  marks: "",
  // Keep the region as the defining context when its content is replaced/pasted so
  // an edit dissolves neither the region nor the card anatomy around it.
  defining: true,
} as const;

/**
 * The tactical-tag region: a short, free-form label (`[T]`, `[NU]`, `[CP]`, ...)
 * the debater types. The token is stored bare; the enclosing brackets are display
 * chrome rendered by CSS `::before` / `::after` on `[data-card-region="tag"]` (see
 * src/index.css), so the tag always displays bracketed without the brackets ever
 * living in the document text. Accepts any token - it is deliberately not a fixed
 * enum.
 *
 * The brackets are **deliberately CSS pseudo-elements, not DOM text nodes**: a
 * literal `[`/`]` text node rendered as a sibling of the node's contentDOM breaks
 * ProseMirror's input reconciliation for the region - typed characters land in the
 * contentEditable DOM but never become a transaction, so the tag silently accepts
 * nothing and loses the text on reload. Keeping the content hole as the node's sole
 * child (like the tagline/cite regions) is what makes the tag typable. This matches
 * how the side-region labels are rendered (CSS `::before`), not by injecting text.
 *
 * Serializes to `<span data-card-region="tag">…</span>`; the tag value round-trips
 * as its bare text, exactly what every consumer (`readCardRegionText`, Auto Speech,
 * export) already reads.
 */
export const cardTag: Node = Node.create({
  name: CARD_TAG_NODE_NAME,
  ...textRegionConfig,
  parseHTML: () => [{ tag: 'span[data-card-region="tag"]' }],
  renderHTML: () => ["span", { "data-card-region": "tag" }, 0],
});

/**
 * The tagline region: a single-line claim/argument summary. Rendered with a
 * `data-card-region="tagline"` hook a styling PR keys the card's emphasis off (this
 * module ships no CSS).
 */
export const cardTagline: Node = Node.create({
  name: CARD_TAGLINE_NODE_NAME,
  ...textRegionConfig,
  parseHTML: () => [{ tag: 'p[data-card-region="tagline"]' }],
  renderHTML: () => ["p", { "data-card-region": "tagline" }, 0],
});

/**
 * The cite region: a single-line, source-first citation with the author's
 * credentials (conventionally written in brackets by the debater as ordinary typed
 * text, e.g. `Smith 24 [Prof of Climate, MIT]`). Rendered as a semantic `<cite>`
 * with the `data-card-region="cite"` hook.
 */
export const cardCite: Node = Node.create({
  name: CARD_CITE_NODE_NAME,
  ...textRegionConfig,
  parseHTML: () => [{ tag: 'cite[data-card-region="cite"]' }],
  renderHTML: () => ["cite", { "data-card-region": "cite" }, 0],
});

/**
 * The body region: the card's prose. `paragraph+` block content whose text runs
 * carry the shared {@link ../editor/marks | marks} - bold and highlight apply here,
 * independently and simultaneously on the same run. Rendered with the
 * `data-card-region="body"` hook.
 */
export const cardBody: Node = Node.create({
  name: CARD_BODY_NODE_NAME,
  content: "paragraph+",
  defining: true,
  parseHTML: () => [{ tag: 'div[data-card-region="body"]' }],
  renderHTML: () => ["div", { "data-card-region": "body" }, 0],
});

/**
 * The card container: one block-group node holding exactly the four regions in
 * order. The content expression `"cardTag cardTagline cardCite cardBody"` *is* the
 * enforced card anatomy.
 *
 * `isolating` keeps a selection, delete, or join from crossing a card boundary, so
 * ordinary editing between two adjacent cards cannot merge them; `defining` keeps
 * the card as the surrounding context when its content is replaced/pasted.
 * Serializes to `<div data-card>` wrapping the four region elements.
 */
export const card: Node = Node.create({
  name: CARD_NODE_NAME,
  group: "block",
  content: `${CARD_TAG_NODE_NAME} ${CARD_TAGLINE_NODE_NAME} ${CARD_CITE_NODE_NAME} ${CARD_BODY_NODE_NAME}`,
  defining: true,
  isolating: true,
  parseHTML: () => [{ tag: "div[data-card]" }],
  renderHTML: () => ["div", { "data-card": "" }, 0],
});

/**
 * The card node model as a ready-to-install extension list: the card container plus
 * its four region nodes.
 *
 * Append it after {@link ./schema.blockFileExtensions | blockFileExtensions} in
 * the shared preset's feature-extension seam, alongside
 * {@link ./card-create.cardCreate | cardCreate} for the keyboard shortcut:
 * `editorPreset({ extensions: [...blockFileExtensions, ...cardExtensions,
 * cardCreate] })`. Order within the list does not matter; what matters is that
 * the whole list is layered after the editor-core baseline, which the preset
 * guarantees.
 */
export const cardExtensions = [card, cardTag, cardTagline, cardCite, cardBody];

/** The free-form field values a {@link buildCardContent} card is seeded with. */
export interface CardFields {
  /** Tactical tag token, stored bare and rendered bracketed. Any short token. */
  tag?: string;
  /** Single-line tagline text. */
  tagline?: string;
  /** Single-line, source-first cite text. */
  cite?: string;
  /** Body prose (a single paragraph). Omit for an empty, editable body. */
  body?: string;
}

/** A `text*` region's JSON content: a lone text leaf, or nothing when empty. */
function textRegion(type: string, text?: string): JSONContent {
  return text
    ? { type, content: [{ type: "text", text }] }
    : { type };
}

/**
 * Builds the document-JSON for a single card node from optional free-form field
 * values - the pure seam the quick-create UI and tests use to produce a card to
 * insert (`editor.commands.insertContent(buildCardContent(...))`).
 *
 * Every field is optional and free-form (the tag is not validated against an enum).
 * An omitted text field yields an empty region; an omitted body yields an empty
 * paragraph, matching what the schema would auto-fill for a bare card - so the
 * builder's output and a schema-filled bare card agree.
 */
export function buildCardContent(fields: CardFields = {}): JSONContent {
  const { tag, tagline, cite, body } = fields;
  return {
    type: CARD_NODE_NAME,
    content: [
      textRegion(CARD_TAG_NODE_NAME, tag),
      textRegion(CARD_TAGLINE_NODE_NAME, tagline),
      textRegion(CARD_CITE_NODE_NAME, cite),
      {
        type: CARD_BODY_NODE_NAME,
        content: [
          body
            ? { type: "paragraph", content: [{ type: "text", text: body }] }
            : { type: "paragraph" },
        ],
      },
    ],
  };
}
