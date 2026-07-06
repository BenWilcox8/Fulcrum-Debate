/**
 * The flow-sheet **RFD (Reason For Decision)** surface: a single free-form text
 * region that lives at the end of the flow, where a debater records the judge's
 * reason for the decision after a round.
 *
 * ## Where the RFD lives (fragment convention)
 *
 * Per the document-model contract (see AGENTS.md), a kind's content lives under
 * named top-level shared types ("fragments") on the document's `Y.Doc`, and each
 * fragment is owned by exactly one PRD. The RFD claims one *new*, fixed fragment
 * on the `flow-sheet` kind, a sibling of `columns` / `nodes` / `subpoints` /
 * `edges`:
 *
 * | Fragment | Yjs type | Meaning |
 * |---|---|---|
 * | `rfd` | `Y.XmlFragment` | The round's free-form Reason For Decision text. |
 *
 * Unlike the per-node content fragments (`contention:<id>` / `subpoint:<id>`),
 * the RFD is **one fixed fragment per document** - there is exactly one RFD per
 * round, so it needs no id keying. It is a `Y.XmlFragment` because its text is
 * edited through the shared Tiptap editor ({@link DocumentEditor}), the same rich
 * surface every other text region in the app uses, so the RFD persists and
 * reloads through the identical Yjs + y-indexeddb path.
 *
 * Yjs binds `rfd` to `Y.XmlFragment` for the life of the document; per the
 * one-fragment-name-binds-to-one-type-forever rule it must never be re-typed or
 * renamed.
 *
 * This module is content-agnostic and React-free: it only names the fragment.
 * The editable surface + its visual delineation live in the canvas layer
 * ({@link ../flow/canvas/RfdSection}).
 */

/**
 * The fixed top-level `Y.XmlFragment` name holding a round's Reason For Decision
 * text on a `flow-sheet` document's `Y.Doc`. A single fragment per document (one
 * RFD per round), so - unlike the per-node content fragments - it is a bare
 * constant, not an id-keyed name builder.
 */
export const FLOW_RFD_FRAGMENT = "rfd";
