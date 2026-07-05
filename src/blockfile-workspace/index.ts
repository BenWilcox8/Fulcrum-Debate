/**
 * The block-file workspace seam: opening *the* block file for the app shell.
 *
 * A block file is a workspace singleton (one per workspace, for now), mapped onto
 * the shared document layer by kind. {@link useBlockFile} is what the routed
 * screen consumes; {@link ensureBlockFile} is the underlying find-or-create.
 */
export {
  BLOCK_FILE_KIND,
  BLOCK_FILE_TITLE,
  ensureBlockFile,
  useBlockFile,
  type UseBlockFileResult,
} from "./workspace";
