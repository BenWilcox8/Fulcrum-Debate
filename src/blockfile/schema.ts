/**
 * The block-file document schema: one continuous editing surface whose top-level
 * Affirmative / Negative division is *first-class enforced structure*, not a
 * heading convention.
 *
 * A block file is where a debater keeps all of their evidence - one large,
 * scrollable document - split by which side of the debate the evidence supports.
 * Later PRDs (a ToC sidebar, card anatomy, the speech-doc pipeline) all build on
 * this schema, so the side division has to be a stable, guaranteed part of the
 * document model that ordinary editing cannot destroy.
 *
 * ## The design: two enforced top-level section nodes in one fragment
 *
 * The block file is a **single** rich-text fragment ({@link BLOCK_FILE_FRAGMENT})
 * bound to one Tiptap editor - so it is genuinely one continuous, scrollable
 * document with one selection model, one scroll position, and one outline
 * (unlike a two-fragment / two-editor stack, which is really two documents drawn
 * next to each other and cannot express a selection or a ToC that spans both
 * sides).
 *
 * The side division is expressed *in the ProseMirror schema* rather than by
 * convention:
 *
 * - Two dedicated container node types, {@link affSection} and
 *   {@link negSection}, each holding ordinary block content (`block+`).
 * - The top-level `doc` node is overridden so its content is exactly
 *   `"affSection negSection"` - one aff region, then one neg region, and nothing
 *   else. See {@link blockDocument}.
 *
 * Because the invariant lives in the schema, ProseMirror *enforces* it for free
 * on every transaction: there is no way to produce a valid document that is
 * missing a side, has two of a side, has them out of order, or has stray content
 * outside the two regions. This is strictly stronger than a plugin that repairs
 * violations after the fact, and it needs no plugin at all.
 *
 * ### Why two distinct node types instead of one node with a `side` attribute
 *
 * Encoding the side in the *node type* (not an attribute) lets the single
 * `doc` content expression `"affSection negSection"` pin down identity **and**
 * order **and** cardinality in one place. A one-node-with-attribute design
 * (`sideSection{2}`) could not tell ProseMirror that the first must be aff and
 * the second neg, so it would still need a plugin to fix up the attributes -
 * exactly the fragile after-the-fact repair this design avoids.
 *
 * ### Why the sections are not in the `block` group
 *
 * The section nodes are deliberately left out of the `block` group. A section's
 * content is `block+`, so keeping sections out of that group makes it
 * structurally impossible for a section to nest inside another section. The
 * `doc` node references the two section types by name, so it does not need them
 * to be in any group.
 *
 * ## Protection against hostile ordinary editing
 *
 * The acceptance requirement is that everyday editing cannot destroy the
 * division. The schema delivers this because ProseMirror will not apply a
 * transaction whose result violates the `doc` content expression, and will
 * auto-fill required-but-empty nodes:
 *
 * - **Select-all + delete** leaves the two sections in place, each backfilled
 *   with an empty paragraph, rather than emptying the document.
 * - **Deleting across the aff/neg boundary** cannot merge the two regions:
 *   {@link affSection} / {@link negSection} are `isolating`, so a selection or a
 *   join is not allowed to cross a section boundary, and merging them would in
 *   any case produce a single-section document the schema forbids.
 * - **Pasting or replacing** the whole document still resolves to a valid
 *   two-section document. `defining: true` keeps a section as the surrounding
 *   context for replaced content instead of letting a paste dissolve it.
 *
 * These behaviours are covered by `schema.test.ts`.
 *
 * ## How a feature editor installs this
 *
 * The block-file schema is layered onto the shared editor through the preset's
 * documented feature-extension seam - it is not a fork of the preset:
 *
 * ```ts
 * const editor = createEditor({
 *   binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
 *   extensions: editorPreset({ extensions: blockFileExtensions }),
 * });
 * // or, in React: <DocumentEditor handle={handle} fragment={BLOCK_FILE_FRAGMENT}
 * //   preset={{ extensions: blockFileExtensions }} />
 * ```
 *
 * {@link blockDocument} is a `doc` node override. The editor core always installs
 * the baseline `Document` (`content: "block+"`); listing {@link blockDocument}
 * after it - which the preset does, since feature extensions come last - makes
 * the block-file `doc` definition win. Tiptap logs a one-line "Duplicate
 * extension names" warning for the shadowed baseline `doc`; that is expected and
 * harmless (the override is intentional), and is the small, documented cost of
 * overriding the top node through the extension seam rather than forking the
 * editor core.
 *
 * The Yjs undo rule is untouched: this module contributes only schema nodes, no
 * `History` extension. Undo continues to flow through the collaboration
 * binding's Yjs history.
 */
import { Node } from "@tiptap/core";

import { type BlockSide } from "./side";

/**
 * The single top-level fragment a block-file document stores its content under
 * (the {@link ../documents | document-model} fragment convention: a top-level
 * `XmlFragment` name on the block file's `Y.Doc`, fixed for the life of the
 * document, never re-typed or renamed).
 *
 * A block file is one continuous document, so all of its rich text - both side
 * regions and everything in them - lives under this one fragment. A later PRD
 * that needs to store block-file data outside the prose (e.g. per-card metadata)
 * claims a *new* fragment; it never repurposes this one.
 */
export const BLOCK_FILE_FRAGMENT = "body";

/**
 * The ProseMirror / document-JSON node-type name of the affirmative region.
 *
 * This name is a schema contract other tools read (section tools, the ToC, card
 * tools locate a side by its node type), so treat it as fixed: never rename it
 * without a coordinated migration of persisted documents.
 */
export const AFF_SECTION_NODE_NAME = "affSection";

/**
 * The ProseMirror / document-JSON node-type name of the negative region. Fixed
 * schema contract - see {@link AFF_SECTION_NODE_NAME}.
 */
export const NEG_SECTION_NODE_NAME = "negSection";

/**
 * Maps each {@link BlockSide} to the node-type name of its region. The single
 * place the side-to-node-name correspondence is defined; addressing helpers key
 * off this rather than hard-coding the strings.
 */
export const SIDE_SECTION_NODE_NAME: Record<BlockSide, string> = {
  aff: AFF_SECTION_NODE_NAME,
  neg: NEG_SECTION_NODE_NAME,
};

/** Shared configuration for both side-section container nodes. */
const sideSectionConfig = {
  // Content is ordinary block content. The section nodes are deliberately NOT in
  // the `block` group, so they can never appear inside this `block+` content -
  // a section can never nest inside a section.
  content: "block+",
  // Keep the section as the defining context when its content is replaced/pasted,
  // so an editing operation dissolves neither section.
  defining: true,
  // Do not let a selection, delete, or join cross a section boundary: this is
  // what stops a cross-boundary delete from merging aff and neg into one region.
  isolating: true,
} as const;

/**
 * The affirmative top-level region: a container holding the aff-side evidence as
 * ordinary block content. One (and only one) of these is the first child of a
 * block-file document, enforced by {@link blockDocument}.
 *
 * Serializes to `<section data-side="aff">` (and parses the same) so the side is
 * addressable in rendered HTML as well as in the document JSON. The `data-side`
 * attribute is the hook a later styling PR keys the `aff` design tokens off; this
 * module ships no CSS.
 */
export const affSection: Node = Node.create({
  name: AFF_SECTION_NODE_NAME,
  ...sideSectionConfig,
  parseHTML: () => [{ tag: 'section[data-side="aff"]' }],
  renderHTML: () => ["section", { "data-side": "aff" }, 0],
});

/**
 * The negative top-level region: the counterpart of {@link affSection} holding
 * the neg-side evidence. Exactly one, always the second child of a block-file
 * document. Serializes to `<section data-side="neg">`.
 */
export const negSection: Node = Node.create({
  name: NEG_SECTION_NODE_NAME,
  ...sideSectionConfig,
  parseHTML: () => [{ tag: 'section[data-side="neg"]' }],
  renderHTML: () => ["section", { "data-side": "neg" }, 0],
});

/**
 * The block-file top-node override: a `doc` whose content is exactly one
 * {@link affSection} followed by one {@link negSection}.
 *
 * This single content expression *is* the enforced side division - it fixes that
 * a block-file document always has both regions, exactly one of each, aff before
 * neg, with nothing outside them. It overrides the editor core's baseline `doc`
 * (see the module notes on the intentional duplicate-name warning).
 */
export const blockDocument: Node = Node.create({
  name: "doc",
  topNode: true,
  content: `${AFF_SECTION_NODE_NAME} ${NEG_SECTION_NODE_NAME}`,
});

/**
 * The block-file schema as a ready-to-install extension list: the `doc` override
 * plus the two side-section nodes.
 *
 * Pass it through the shared preset's feature-extension seam -
 * `editorPreset({ extensions: blockFileExtensions })` - so the block file gets
 * the shared marks and headings on top of its enforced side structure. The order
 * (doc override first) does not matter for correctness; what matters is that the
 * whole list is layered *after* the editor-core baseline, which the preset
 * guarantees.
 */
export const blockFileExtensions = [blockDocument, affSection, negSection];
