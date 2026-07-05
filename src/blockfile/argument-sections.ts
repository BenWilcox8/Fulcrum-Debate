/**
 * Argument-type sections within a block-file side.
 *
 * A block file's two top-level regions (aff / neg) are the *sides* - enforced by
 * the {@link ./schema | schema}. Inside a side, a debater groups evidence under
 * **argument-type headers** like `AT: Gold` or `AT: Fusion` ("AT" = "answers
 * to"). Those headers are ordinary {@link ../editor/headings | headings}, not new
 * schema nodes: the side division has to be structurally unbreakable, but
 * argument sections come and go constantly as a debater cuts cards, so they ride
 * on the flexible heading layer rather than the rigid section-node layer.
 *
 * This module fixes the *contract* between that heading convention and the tools
 * that read it - the ToC sidebar, the speech-doc pipeline, navigation - and
 * provides the per-side query seam. It is a pure derivation of ProseMirror state,
 * exactly like the {@link ../editor/headings/outline | outline query} and the
 * {@link ./sections | side-region helpers} it composes; there is nothing to keep
 * in sync and nothing to invalidate.
 *
 * ## Which heading level marks an argument section
 *
 * An argument-type section is a **level-{@link BLOCK_SECTION_HEADING_LEVEL}
 * heading that is a direct child of a side region**. A side is already the top
 * division of the document, so the first heading level *inside* a side is the
 * natural place its argument groups begin; deeper headings (a subpoint, a card
 * tag, an analytic under an argument) nest *within* a section and do not start a
 * new one. Scoping to direct children of the section - not every descendant -
 * means a level-1 heading buried inside some future nested block could never be
 * mistaken for a top-level argument section.
 *
 * This level is a stable contract other tools depend on; treat it as fixed.
 *
 * ## Position semantics
 *
 * The `pos` on a {@link BlockSection} is the ProseMirror position immediately
 * before the heading node - the same snapshot semantics as
 * {@link ../editor/headings/outline.OutlineHeading | OutlineHeading}: valid only
 * against the document version it was read from, and `pos + 1` selects inside the
 * heading. A section list is therefore a snapshot; re-derive after edits (that is
 * what {@link observeSideSections} does on every document change).
 */
import type { Editor, EditorEvents } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { HeadingLevel } from "../editor/headings";
import type { BlockSide } from "./side";
import { sideRegionsFromDoc } from "./sections";

/** The node-type name ProseMirror gives a heading node (Tiptap's default). */
const HEADING_NODE = "heading";

/**
 * The heading level that denotes an argument-type section inside a side.
 *
 * A level-1 heading that is a direct child of a side region begins a new
 * argument section; every deeper heading nests within the section it falls under.
 * This is a stable contract the ToC, speech-doc pipeline, and navigation read -
 * never repoint it without a coordinated migration of persisted documents and
 * their consumers.
 */
export const BLOCK_SECTION_HEADING_LEVEL: HeadingLevel = 1;

/** One argument-type section within a side of a block file. */
export interface BlockSection {
  /** The side this section belongs to (its region is where it was found). */
  side: BlockSide;
  /** The section's label - the header's plain text, inline marks flattened. */
  label: string;
  /**
   * The heading level of the section header. Always
   * {@link BLOCK_SECTION_HEADING_LEVEL}; carried explicitly so a consumer reads
   * one shape whether or not the level ever widens.
   */
  level: HeadingLevel;
  /**
   * The ProseMirror position immediately before the section's heading node in
   * the document it was read from - the stable identifier a consumer scrolls to.
   * Valid only against that document version (see the module notes); `pos + 1`
   * addresses a selection inside the heading.
   */
  pos: number;
}

/**
 * Collects the argument-type sections of one side from a block-file document
 * node, in document order. Shared by {@link getSideSections} and any caller that
 * already holds a ProseMirror doc node (e.g. one parsed from persisted JSON).
 *
 * Only direct children of the side's section node are considered, so a
 * level-{@link BLOCK_SECTION_HEADING_LEVEL} heading nested deeper inside the
 * side's content is never counted as a section. Content in the *other* side is
 * outside the walked region and can never leak in.
 *
 * Throws (via {@link sideRegionsFromDoc}) if the document is not block-file
 * shaped - callers can rely on both side regions existing.
 */
export function sideSectionsFromDoc(
  doc: ProseMirrorNode,
  side: BlockSide,
): BlockSection[] {
  const region = sideRegionsFromDoc(doc)[side];
  const sections: BlockSection[] = [];

  // `offset` is relative to the section's content; the position immediately
  // before a direct child is `contentStart + offset`, matching the outline's
  // "position before the node" convention (contentStart === pos + 1).
  region.node.forEach((child, offset) => {
    if (
      child.type.name === HEADING_NODE &&
      child.attrs.level === BLOCK_SECTION_HEADING_LEVEL
    ) {
      sections.push({
        side,
        label: child.textContent,
        level: child.attrs.level as HeadingLevel,
        pos: region.contentStart + offset,
      });
    }
  });

  return sections;
}

/**
 * Returns one side's argument-type sections in document order: for each its
 * {@link BlockSection.side | side}, {@link BlockSection.label | label},
 * {@link BlockSection.level | level}, and {@link BlockSection.pos | position}.
 *
 * The editor convenience form of {@link sideSectionsFromDoc}; equivalent to
 * `sideSectionsFromDoc(editor.state.doc, side)`. Pure over the editor's current
 * state - calling it twice without an edit returns equal lists. See the module
 * notes for position semantics.
 */
export function getSideSections(editor: Editor, side: BlockSide): BlockSection[] {
  return sideSectionsFromDoc(editor.state.doc, side);
}

/**
 * Subscribes to one side's argument-type sections, invoking `listener` with a
 * fresh list immediately and again after every document change. Returns an
 * unsubscribe function.
 *
 * This is the API a per-side ToC consumes: it never has to know *when* to
 * recompute, and because {@link getSideSections} is a pure snapshot the listener
 * always receives a list consistent with the current document. Transactions that
 * do not change the document (selection-only, focus) are ignored, mirroring
 * {@link ../editor/headings/outline.observeOutline | observeOutline}.
 */
export function observeSideSections(
  editor: Editor,
  side: BlockSide,
  listener: (sections: BlockSection[]) => void,
): () => void {
  listener(getSideSections(editor, side));

  const handler = ({ transaction }: EditorEvents["update"]) => {
    if (transaction.docChanged) {
      listener(getSideSections(editor, side));
    }
  };

  editor.on("update", handler);
  return () => {
    editor.off("update", handler);
  };
}
