/**
 * Public surface of the block-file document type.
 *
 * A block file is a debater's evidence store: one continuous, scrollable
 * document whose top-level Affirmative / Negative division is enforced by the
 * ProseMirror schema, not by convention. This module exposes exactly two things
 * feature code consumes:
 *
 * - The **schema** ({@link blockFileExtensions}, {@link BLOCK_FILE_FRAGMENT}, and
 *   the node/side constants) - layer {@link blockFileExtensions} onto the shared
 *   {@link ../editor/preset.editorPreset | editorPreset}'s feature-extension seam
 *   and bind the editor to {@link BLOCK_FILE_FRAGMENT} to get a block-file
 *   editing surface.
 * - The **addressing helpers** ({@link getSideRegions} & friends) - locate each
 *   side's content region, the seam section tools, a ToC sidebar, and card tools
 *   build on.
 *
 * See {@link ./schema} for the design (why two enforced section nodes in one
 * fragment) and {@link ./sections} for the position semantics of the helpers.
 */
export { type BlockSide, BLOCK_SIDES, isBlockSide } from "./side";
export {
  BLOCK_FILE_FRAGMENT,
  AFF_SECTION_NODE_NAME,
  NEG_SECTION_NODE_NAME,
  SIDE_SECTION_NODE_NAME,
  affSection,
  negSection,
  blockDocument,
  blockFileExtensions,
} from "./schema";
export {
  type BlockSideRegion,
  sideRegionsFromDoc,
  getSideRegions,
  getSideRegion,
  focusSide,
} from "./sections";
