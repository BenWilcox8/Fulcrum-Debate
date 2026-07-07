/**
 * The **pluggable export-target boundary** - the seam the one-click Export
 * action delivers through, and the extension point the next slice (SpeechDrop)
 * plugs into without reworking the action.
 *
 * ## The contract
 *
 * Payload assembly (per surface) and *delivery* (per target) are deliberately
 * two sides of one seam:
 *
 * - A surface (speech doc, block file) assembles an {@link ExportPayload} - the
 *   document rendered once, formatting preserved, in every representation a
 *   target might need (a rich, email-friendly HTML document and a faithful
 *   plain-text form). Assembly never knows *where* the payload goes.
 * - An {@link ExportTarget} takes a payload and delivers it, returning a
 *   reportable {@link ExportResult}. A target never knows *which surface* built
 *   the payload.
 *
 * Because the payload carries both an HTML and a plain-text rendering, a target
 * chooses the representation that fits its transport (the Email target drafts
 * from the plain-text form; a future rich transport can send the HTML) without
 * assembly changing. Adding a target is one new object implementing this
 * interface plus one entry in the action's target list - the Email target is
 * the reference implementation; SpeechDrop is the next slice.
 *
 * A target must **not throw for an expected failure** (the OS opener is missing,
 * the transport is offline): it resolves with `{ ok: false, message }` so the
 * action can surface non-intrusive feedback. Rejecting is reserved for
 * programmer error.
 */

/**
 * A document rendered for export - assembled once per surface, formatting
 * preserved, in every representation a target might need. A target picks the
 * form that fits its transport.
 */
export interface ExportPayload {
  /**
   * The subject / title line for the export (an email subject, a share title).
   * Derived from the document's title, with a surface-appropriate fallback.
   */
  subject: string;
  /**
   * The document as a complete, email-friendly HTML document string, with the
   * shared marks preserved as semantic HTML (`<strong>`, `<mark>`, `<h1>`…) so it
   * renders formatted in any HTML-capable target without the app's stylesheet.
   */
  html: string;
  /**
   * The document as plain text with its block structure preserved (blank lines
   * between blocks). The mailto-friendly form, and a universal fallback for any
   * plain-text-only transport.
   */
  text: string;
}

/** The reportable outcome of an export, for non-intrusive success/failure feedback. */
export interface ExportResult {
  /** Whether the payload was handed off to the target's transport. */
  ok: boolean;
  /** A short, human-readable line describing the outcome. */
  message: string;
  /**
   * Marks an *expected, non-error* outcome that happens to not hand off - most
   * notably the user deliberately cancelling the flow. It still resolves
   * `ok: false` (nothing was delivered), but the action renders it neutrally
   * rather than in the error colour, since a cancel is not a failure.
   */
  neutral?: boolean;
}

/**
 * A destination the Export action can deliver a payload to. Email ships now;
 * SpeechDrop (and any future target) implements this same interface and is added
 * to the action's target list - the action itself never changes.
 */
export interface ExportTarget {
  /** Stable identifier (e.g. `"email"`, `"speechdrop"`). */
  readonly id: string;
  /** Display label for the action affordance (e.g. `"Email"`). */
  readonly label: string;
  /**
   * Delivers `payload` to this target's transport. Resolves with an
   * {@link ExportResult} - including for expected failures (a missing OS opener,
   * an offline transport), which resolve `ok: false` rather than throwing, so the
   * action reports them as feedback.
   */
  export(payload: ExportPayload): Promise<ExportResult>;
}
