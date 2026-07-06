/**
 * The **argument-row** model for a flow-node text surface: the schema that turns a
 * box's editor content into stacked *argument rows*, the Enter / Shift+Enter
 * transitions that build them, and the pure locator that makes each row and its
 * grouped responses addressable.
 *
 * A debater flowing a round fills each box (a {@link ./contention | contention} or
 * {@link ./subpoint | subpoint}) with a vertical stack of *arguments*, and under
 * an argument a *group of responses* (the rebuttals to that one argument), the
 * responses separated by dividers. This module models that structure directly in
 * the ProseMirror schema - the same discipline the block-file
 * {@link ../blockfile/schema | side division} and {@link ../blockfile/card | card
 * anatomy} use: structure is enforced by the schema, not by convention.
 *
 * ## The design: two enforced container node types under the box's `doc`
 *
 * A box's content fragment (`contention:<id>` / `subpoint:<id>`) is one Tiptap
 * editor. Its top node is overridden so its content is exactly `argument+`, and:
 *
 * | Node | Content | Meaning |
 * |---|---|---|
 * | `doc` ({@link flowArgumentDocument}) | `argument+` | The box: a stack of argument rows. |
 * | `argument` ({@link argument}) | `response+` | One top-level argument row - the group. |
 * | `response` ({@link response}) | `paragraph+` | One grouped response within an argument. |
 *
 * Because the nesting lives in the schema, ProseMirror enforces it for free: a box
 * always holds at least one argument, an argument always holds at least one
 * response, and a response always holds prose. There is no valid document shape
 * that loses the grouping.
 *
 * ### Why distinct `argument` / `response` node types
 *
 * Encoding the group in node *types* (not attributes) is what lets the two
 * gestures below map to plain structural splits at two different depths, and gives
 * the drag/strike PRD a stable, positionally-addressable unit for both an argument
 * *and* an individual response (see {@link locateArgumentRows}) - exactly the
 * "card as a unit" discipline the card-anatomy API established. A one-node design
 * could express neither the two split depths nor the two addressable levels.
 *
 * ## The two gestures (the key-event contract)
 *
 * The whole interaction is two keystrokes, no dialog and no focus loss:
 *
 * - **Enter -> {@link newArgumentRow}**: split at the *argument* level, creating a
 *   new top-level argument row (its own response group) below the current one and
 *   moving the caret into it. Trailing text after the caret rides into the new row,
 *   the natural editor feel.
 * - **Shift+Enter -> {@link newGroupedResponse}**: split at the *response* level,
 *   appending a new response to the **current argument** (staying in the same box,
 *   same group) - the divider renders between adjacent responses.
 *
 * Both are ordinary `split`s at a computed depth ({@link splitFlowRow}), so they
 * carry marks and content losslessly and compose with undo through the Yjs
 * history. They are exposed as plain `(editor) => boolean` helpers *and* bound by
 * {@link argumentRowKeymap}; keeping the transition a named, reusable command is
 * deliberate - the **Shorthand Engine PRD** hooks the same Enter / Shift+Enter
 * transition later, wrapping these rather than re-deriving the split.
 *
 * ## Rendering: data hooks, no CSS
 *
 * Like the side/card schemas, this module ships **no CSS**. Each node serializes
 * with a `data-flow-argument` / `data-flow-response` hook; the divider *between*
 * adjacent responses is a single sibling-combinator rule keyed off those hooks in
 * `src/index.css`, matching the flow's existing `shell-border` divider language.
 *
 * ## How a flow node installs this
 *
 * Layer it onto the box's editor through the shared preset's feature-extension
 * seam, exactly like the card model:
 *
 * ```ts
 * const editor = useDocumentEditor({
 *   handle,
 *   fragment: contentionContentFragment(nodeId),
 *   preset: { extensions: [...argumentRowExtensions, argumentRowKeymap] },
 * });
 * ```
 *
 * No `History` extension is added - undo continues to flow through the
 * collaboration binding's Yjs history.
 */
import * as Y from "yjs";
import { Extension, Node, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { canSplit } from "@tiptap/pm/transform";

/**
 * The ProseMirror / document-JSON node-type name of a top-level argument row - the
 * response *group*. Fixed schema contract: sibling slices (the drag/strike PRD)
 * locate arguments by this type, so never rename it without a coordinated
 * migration of persisted flow documents.
 */
export const ARGUMENT_NODE_NAME = "argument";

/**
 * The ProseMirror / document-JSON node-type name of a single grouped response
 * within an argument. Fixed schema contract - see {@link ARGUMENT_NODE_NAME}.
 */
export const RESPONSE_NODE_NAME = "response";

/**
 * One grouped response: `paragraph+` prose whose runs carry the shared marks. Kept
 * out of every group so it can only appear by name inside an {@link argument}
 * (never loose in the box), and `defining` so replacing/pasting into it keeps the
 * response as the surrounding context. Serializes to
 * `<div data-flow-response>` - the hook the divider CSS keys off.
 */
export const response: Node = Node.create({
  name: RESPONSE_NODE_NAME,
  content: "paragraph+",
  defining: true,
  parseHTML: () => [{ tag: "div[data-flow-response]" }],
  renderHTML: () => ["div", { "data-flow-response": "" }, 0],
});

/**
 * One top-level argument row: the group of one or more {@link response}s
 * (`response+`). Kept out of every group so it can only appear by name inside the
 * box's `doc` (never nested inside a response), and `defining` so a paste/replace
 * keeps the argument as context. Serializes to `<div data-flow-argument>`.
 */
export const argument: Node = Node.create({
  name: ARGUMENT_NODE_NAME,
  content: `${RESPONSE_NODE_NAME}+`,
  defining: true,
  parseHTML: () => [{ tag: "div[data-flow-argument]" }],
  renderHTML: () => ["div", { "data-flow-argument": "" }, 0],
});

/**
 * The box top-node override: a `doc` whose content is exactly `argument+` - a
 * non-empty stack of argument rows. Overrides the editor core's baseline `doc`
 * (`block+`); listing it after the baseline - which the preset does, feature
 * extensions coming last - makes this definition win (Tiptap logs a one-line
 * "Duplicate extension names: ['doc']" warning, expected and harmless, exactly as
 * the block-file `doc` override does).
 */
export const flowArgumentDocument: Node = Node.create({
  name: "doc",
  topNode: true,
  content: `${ARGUMENT_NODE_NAME}+`,
});

/**
 * The argument-row schema as a ready-to-install extension list: the `doc`
 * override plus the argument and response nodes. Pass it (with
 * {@link argumentRowKeymap}) through the shared preset's feature-extension seam.
 * Order within the list does not matter; what matters is that it is layered after
 * the editor-core baseline, which the preset guarantees.
 */
export const argumentRowExtensions = [flowArgumentDocument, argument, response];

/** The subset of {@link CommandProps} the row split needs. */
interface RowCommandProps {
  tr: Transaction;
  state: EditorState;
  dispatch: ((tr: Transaction) => void) | undefined;
}

/**
 * The depth of the nearest ancestor of `$from` whose node type is `typeName`, or
 * `-1` if the selection is not inside one. Walks outward from the selection depth.
 */
function ancestorDepth($from: ResolvedPos, typeName: string): number {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === typeName) return depth;
  }
  return -1;
}

/**
 * A ProseMirror command that splits the box structure up to (and including) the
 * nearest ancestor of type `targetTypeName`, so the caret's content moves into a
 * fresh sibling of that ancestor. Splitting at the `argument` depth creates a new
 * top-level argument row; splitting at the `response` depth creates a new grouped
 * response within the same argument. Returns `false` (a no-op) when the selection
 * is not inside such an ancestor or the split is not schema-valid.
 */
function splitFlowRow(targetTypeName: string) {
  return ({ tr, state, dispatch }: RowCommandProps): boolean => {
    const { $from } = state.selection;
    const depth = ancestorDepth($from, targetTypeName);
    if (depth < 0) return false;
    // Number of nodes to split: from the paragraph the caret sits in up to and
    // including the target ancestor.
    const splitDepth = $from.depth - depth + 1;

    if (!state.selection.empty) tr.deleteSelection();
    const pos = tr.selection.from;
    if (!canSplit(tr.doc, pos, splitDepth)) return false;

    if (dispatch) tr.split(pos, splitDepth).scrollIntoView();
    return true;
  };
}

/**
 * **Enter transition:** create a new top-level argument row below the current one
 * and move the caret into it. Returns whether it applied (`false` when the caret
 * is not inside an argument row). The Shorthand Engine PRD wraps this same command.
 */
export function newArgumentRow(editor: Editor): boolean {
  return editor.commands.command(splitFlowRow(ARGUMENT_NODE_NAME));
}

/**
 * **Shift+Enter transition:** append a new grouped response to the current
 * argument (same box, same group) and move the caret into it - the divider renders
 * between adjacent responses. Returns whether it applied. The Shorthand Engine PRD
 * wraps this same command.
 */
export function newGroupedResponse(editor: Editor): boolean {
  return editor.commands.command(splitFlowRow(RESPONSE_NODE_NAME));
}

/**
 * The keyboard contract for the two row transitions, as a ready-to-install
 * extension carrying *only* the bindings (the actual work lives in
 * {@link newArgumentRow} / {@link newGroupedResponse}, which the Shorthand Engine
 * PRD also calls). Append it after {@link argumentRowExtensions} in the shared
 * preset's feature-extension seam. High priority so its Enter binding wins over the
 * editor's baseline block-split before falling through when not inside a row.
 */
export const argumentRowKeymap: Extension = Extension.create({
  name: "argumentRowKeymap",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () => newArgumentRow(this.editor),
      "Shift-Enter": () => newGroupedResponse(this.editor),
    };
  },
});

/** One grouped response's position span within the document. */
export interface ResponseSpan {
  /** The response node (a read snapshot). */
  readonly node: ProseMirrorNode;
  /** Absolute position immediately before the response node. */
  readonly from: number;
  /** Absolute position immediately after the response node. */
  readonly to: number;
}

/** One argument row's position span plus its ordered grouped responses. */
export interface ArgumentRowSpan {
  /** The argument node (a read snapshot). */
  readonly node: ProseMirrorNode;
  /** Absolute position immediately before the argument node. */
  readonly from: number;
  /** Absolute position immediately after the argument node. */
  readonly to: number;
  /** The argument's grouped responses, in document order. */
  readonly responses: readonly ResponseSpan[];
}

/**
 * The pure locator that makes a box's grouping addressable: walks a flow-node
 * `doc` and returns one {@link ArgumentRowSpan} per top-level argument row, each
 * carrying its own `[from, to]` span and its ordered {@link ResponseSpan}s. This
 * is the seam the drag/strike PRD targets to move or strike a specific argument or
 * an individual response.
 *
 * Pure and position-only (no editor, nothing to invalidate), the same discipline
 * as the card-unit locator: every position is valid only against the document
 * version it was read from - re-derive after edits. `doc` is a flow-node top node
 * whose content is `argument+`; a non-argument child (which the schema forbids) is
 * skipped rather than throwing.
 */
export function locateArgumentRows(doc: ProseMirrorNode): ArgumentRowSpan[] {
  const rows: ArgumentRowSpan[] = [];
  // For the top `doc` node, a child's offset is its absolute start position (the
  // doc node itself contributes no opening token).
  doc.forEach((argNode, argOffset) => {
    if (argNode.type.name !== ARGUMENT_NODE_NAME) return;
    const responses: ResponseSpan[] = [];
    // +1 to step past the argument's own opening token into its content.
    const contentStart = argOffset + 1;
    argNode.forEach((respNode, respOffset) => {
      if (respNode.type.name !== RESPONSE_NODE_NAME) return;
      const from = contentStart + respOffset;
      responses.push({ node: respNode, from, to: from + respNode.nodeSize });
    });
    rows.push({
      node: argNode,
      from: argOffset,
      to: argOffset + argNode.nodeSize,
      responses,
    });
  });
  return rows;
}

/**
 * Load-time migration for a flow-node content fragment from the legacy
 * bare-paragraph schema (old doc content was `block+`) to the current
 * argument-row schema (`argument+`).
 *
 * When the fragment's top-level children are all `<paragraph>` XML elements
 * (indicating content written before argument rows were introduced), each
 * paragraph is wrapped in `<argument><response>...</response></argument>` so the
 * existing text survives intact under the new schema rather than being discarded
 * by `createAndFill`.
 *
 * Safe to call on every editor open: it is a no-op when the fragment is empty or
 * already contains `<argument>` elements at the top level.
 */
export function migrateFlowNodeFragment(
  doc: Y.Doc,
  fragment: Y.XmlFragment,
): void {
  const children = fragment.toArray();
  if (children.length === 0) return;

  if (
    children.some(
      (child) =>
        child instanceof Y.XmlElement && child.nodeName === ARGUMENT_NODE_NAME,
    )
  ) {
    return;
  }

  if (
    !children.every(
      (child) =>
        child instanceof Y.XmlElement && child.nodeName === "paragraph",
    )
  ) {
    return;
  }

  // Snapshot delta content from each paragraph's text nodes BEFORE any mutation.
  // Y.XmlText.toDelta() returns [{insert: "text", attributes?: {...}}, ...].
  const paragraphDeltas = (children as Y.XmlElement[]).map((para) =>
    para.toArray().flatMap((child) =>
      child instanceof Y.XmlText
        ? [(child.toDelta() as Array<{ insert: string; attributes?: Record<string, unknown> }>)]
        : [],
    ),
  );

  doc.transact(() => {
    fragment.delete(0, children.length);
    paragraphDeltas.forEach((deltas) => {
      const newPara = new Y.XmlElement("paragraph");
      deltas.forEach((delta) => {
        const newText = new Y.XmlText();
        if (delta.length > 0) {
          newText.applyDelta(delta);
        }
        newPara.push([newText]);
      });

      const newResponse = new Y.XmlElement(RESPONSE_NODE_NAME);
      newResponse.push([newPara]);

      const newArgument = new Y.XmlElement(ARGUMENT_NODE_NAME);
      newArgument.push([newResponse]);

      fragment.push([newArgument]);
    });
  });
}
