/**
 * The **Email export target** - slice 1 of the pluggable export boundary.
 *
 * ## Why `mailto:` (the local-first choice)
 *
 * The app is a local-first Tauri shell with no account or SMTP wiring, so the
 * Email target does not *send* mail - it opens a pre-filled draft in whatever
 * mail client the user already has, and the user sends it. That is the
 * local-first, zero-configuration mechanism: a `mailto:` URL handed to the OS's
 * default handler through the Tauri/Rust {@link ../ipc.openExternal | open_external}
 * boundary. The transport (opening the URL) is injectable so tests stub it.
 *
 * ## The email-friendly form
 *
 * A `mailto:` URL's `body` is plain text per RFC 6068 - it cannot carry an HTML
 * body - so the draft is composed from the payload's structure-preserving
 * plain-text rendering (the {@link ExportPayload}'s email-friendly form). The
 * payload's rich HTML is preserved for targets whose transport can carry it
 * (the next slice); the Email target simply picks the representation `mailto:`
 * supports. The subject rides the URL's `subject` field.
 */
import { openExternal } from "../ipc";
import type { ExportPayload, ExportResult, ExportTarget } from "./target";

/** The stable id + label for the Email target. */
export const EMAIL_TARGET_ID = "email";
export const EMAIL_TARGET_LABEL = "Email";

/** The transport seam: opens a URL in the OS default handler. Injectable for tests. */
export type OpenUrl = (url: string) => Promise<void>;

/** Builds the `mailto:` draft URL for a payload (subject + plain-text body). */
export function mailtoUrl(payload: ExportPayload): string {
  const params = new URLSearchParams();
  if (payload.subject) params.set("subject", payload.subject);
  if (payload.text) params.set("body", payload.text);
  const query = params.toString();
  return query ? `mailto:?${query}` : "mailto:";
}

/**
 * Creates the Email export target. `openUrl` defaults to the real Tauri
 * {@link openExternal} boundary; tests pass a stub to keep the transport out of
 * the assertion.
 *
 * `export` never throws for an expected failure: if the opener cannot be launched
 * it resolves `{ ok: false }` with a readable reason, so the Export action can
 * surface non-intrusive feedback rather than crashing.
 */
export function createEmailTarget(openUrl: OpenUrl = openExternal): ExportTarget {
  return {
    id: EMAIL_TARGET_ID,
    label: EMAIL_TARGET_LABEL,
    async export(payload: ExportPayload): Promise<ExportResult> {
      try {
        await openUrl(mailtoUrl(payload));
        return { ok: true, message: "Opened an email draft in your mail app." };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          message: `Could not open your mail app. ${reason}`.trim(),
        };
      }
    },
  };
}

/** The app's Email target, wired to the real Tauri transport. */
export const emailTarget = createEmailTarget();

/**
 * The app's default export-target list, offered by the Export action on both
 * surfaces. Email ships now; SpeechDrop (the next slice) is added here as one
 * more {@link ExportTarget} and the action picks it up with no other change.
 */
export const DEFAULT_EXPORT_TARGETS: readonly ExportTarget[] = [emailTarget];
