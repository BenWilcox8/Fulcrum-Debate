/**
 * The kind of artifact a Yjs document represents.
 *
 * Every persisted document declares exactly one kind. Kinds are intentionally
 * coarse - one per top-level artifact a debater creates - and, in this
 * foundation layer, drive nothing beyond being carried on the handle for later
 * routing (the registry and service API are separate tasks). Keep this list
 * minimal: add a kind only when a genuinely new artifact type needs its own
 * document.
 */
export const DOCUMENT_KINDS = [
  /** A debate flow sheet (arguments tracked across speeches). */
  "flow-sheet",
  /** A speech document (the text a debater reads or drafts). */
  "speech-doc",
  /** A reusable block file (prewritten arguments/evidence). */
  "block-file",
] as const;

/** A document's artifact kind. One of {@link DOCUMENT_KINDS}. */
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Type guard: is `value` a known {@link DocumentKind}? */
export function isDocumentKind(value: unknown): value is DocumentKind {
  return (
    typeof value === "string" &&
    (DOCUMENT_KINDS as readonly string[]).includes(value)
  );
}
