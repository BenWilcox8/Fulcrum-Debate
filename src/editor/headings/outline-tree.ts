/**
 * Outline-to-tree derivation - the hierarchy the ToC panel renders.
 *
 * {@link getOutline} produces a *flat* {@link OutlineHeading}[] in document
 * order; a table-of-contents renders that as a nested list. Rather than make
 * every consumer re-derive the nesting (and risk each doing it differently),
 * {@link buildOutlineTree} turns the flat list into a forest once, keyed purely
 * by heading `level`.
 *
 * ## Nesting rule
 *
 * Each heading nests under the **nearest preceding heading of a shallower
 * level** (strictly smaller `level`), preserving document order among siblings.
 * A heading with no such ancestor is a **root**. Consecutive headings at the
 * same level are therefore siblings, and a document that opens on a deep heading
 * (e.g. a lone `h3`) simply yields that heading as a root - nothing is dropped.
 *
 * ## Purity
 *
 * The derivation is a pure function of its input array: it does not read an
 * editor or ProseMirror state, does not mutate the headings it is given (each
 * tree node is a fresh object spread over the source heading), and returns
 * structurally equal trees for structurally equal inputs. `level`, `text`, and
 * `pos` are carried through verbatim, so a node still addresses its heading via
 * `pos` exactly as {@link OutlineHeading} documents.
 */
import type { OutlineHeading } from "./outline";

/**
 * One node in the outline tree: an {@link OutlineHeading} plus its nested
 * children (headings of a deeper level that fall under it in document order).
 * A leaf has an empty `children` array.
 */
export interface OutlineTreeNode extends OutlineHeading {
  /** Headings nested directly under this one, in document order. */
  children: OutlineTreeNode[];
}

/**
 * Derives the nested outline tree from a flat, document-ordered
 * {@link OutlineHeading}[]. See the module notes for the nesting rule and the
 * purity guarantees.
 *
 * @param headings The flat outline, in document order (as {@link getOutline}
 *   returns it).
 * @returns The forest of root {@link OutlineTreeNode}s, in document order.
 */
export function buildOutlineTree(
  headings: readonly OutlineHeading[],
): OutlineTreeNode[] {
  const roots: OutlineTreeNode[] = [];
  // Ancestors of the heading currently being placed, shallowest-first. The top
  // of the stack is always the nearest open ancestor; we pop any entry whose
  // level is not strictly shallower than the incoming heading.
  const ancestors: OutlineTreeNode[] = [];

  for (const heading of headings) {
    const node: OutlineTreeNode = { ...heading, children: [] };

    while (
      ancestors.length > 0 &&
      ancestors[ancestors.length - 1].level >= heading.level
    ) {
      ancestors.pop();
    }

    if (ancestors.length === 0) {
      roots.push(node);
    } else {
      ancestors[ancestors.length - 1].children.push(node);
    }

    ancestors.push(node);
  }

  return roots;
}
