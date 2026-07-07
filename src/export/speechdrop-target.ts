/**
 * The **SpeechDrop export target** - slice 2 of the pluggable export boundary.
 *
 * SpeechDrop (speechdrop.net) is the debate world's room-code file-sharing tool:
 * a debater joins a round's room by its short code and drops documents in for
 * everyone in the room. This target plugs into the *same* {@link ExportTarget}
 * boundary as Email (PR #89) - the {@link ./react/ExportButton | Export action}
 * is untouched; adding this target to the action's list is the whole wiring.
 *
 * ## Two injected seams keep the model React- and Tauri-free
 *
 * - **`promptRoomCode`** collects the room code at export time (a React modal in
 *   the app; a stub in tests). Returning `null` means the debater cancelled, and
 *   the export is a clean, non-error no-op.
 * - **`upload`** performs the actual network upload. In the app this is the
 *   Rust/Tauri {@link ../ipc.uploadToSpeechDrop | speechdrop_upload} boundary
 *   (all outbound network goes through Rust, host-locked to speechdrop.net); in
 *   tests it is a stub, so payload correctness and every error path are asserted
 *   without a network.
 *
 * ## Formatting preserved (RTF)
 *
 * SpeechDrop's upload endpoint accepts document types, not `text/html`, so the
 * target derives an **RTF** document from the payload's HTML ({@link htmlToRtf})
 * - in SpeechDrop's allowlist and preserving bold/underline/headings/highlight.
 * This is a target-internal choice of representation (the boundary's intent), not
 * a change to payload assembly.
 */
import { htmlToRtf } from "./rtf";
import type { ExportPayload, ExportResult, ExportTarget } from "./target";

/** The stable id + label for the SpeechDrop target. */
export const SPEECHDROP_TARGET_ID = "speechdrop";
export const SPEECHDROP_TARGET_LABEL = "SpeechDrop";

/** The MIME type SpeechDrop uploads use (RTF preserves formatting). */
export const SPEECHDROP_UPLOAD_MIME = "text/rtf";

/** The upload seam: delivers one file to a SpeechDrop room. Injectable for tests. */
export type SpeechDropUpload = (args: {
  roomCode: string;
  fileName: string;
  contentType: string;
  /** The file bytes, base64-encoded (binary-safe across the IPC boundary). */
  contentBase64: string;
}) => Promise<void>;

/**
 * Prompts for the room code at export time, seeded with the last-used code (or
 * `null` if none). Resolves the entered code, or `null` if the debater
 * cancelled.
 */
export type PromptRoomCode = (
  lastCode: string | null,
) => Promise<string | null>;

/** Options for {@link createSpeechDropTarget}. */
export interface SpeechDropTargetOptions {
  /** Collects the room code at export time. */
  promptRoomCode: PromptRoomCode;
  /** Performs the upload (the Rust/Tauri boundary in the app). */
  upload: SpeechDropUpload;
  /** Reads the last-used room code to seed the prompt. Defaults to none. */
  getLastRoomCode?: () => string | null;
  /** Persists the room code after a successful upload. Defaults to a no-op. */
  setLastRoomCode?: (code: string) => void;
}

/** Base64-encodes a UTF-8 string in both browser and jsdom (no Node Buffer). */
function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Derives a safe RTF file name from the payload subject. */
function rtfFileName(subject: string): string {
  const base = subject.trim().replace(/[\\/:*?"<>|]+/g, "").trim();
  return `${base || "Export"}.rtf`;
}

/**
 * Creates the SpeechDrop export target.
 *
 * `export` never throws for an expected failure - a cancelled prompt, an
 * unreachable host, a bad room code all resolve `{ ok: false }` (or a neutral
 * cancel message) with a readable line, so the Export action surfaces
 * non-intrusive feedback rather than crashing.
 */
export function createSpeechDropTarget(
  options: SpeechDropTargetOptions,
): ExportTarget {
  const {
    promptRoomCode,
    upload,
    getLastRoomCode = () => null,
    setLastRoomCode = () => {},
  } = options;

  return {
    id: SPEECHDROP_TARGET_ID,
    label: SPEECHDROP_TARGET_LABEL,
    async export(payload: ExportPayload): Promise<ExportResult> {
      const entered = await promptRoomCode(getLastRoomCode());
      if (entered === null) {
        // A deliberate cancel is a clean no-op, not a failure - render neutral.
        return { ok: false, neutral: true, message: "SpeechDrop upload cancelled." };
      }
      const roomCode = entered.trim();
      if (roomCode === "") {
        return { ok: false, message: "Enter a SpeechDrop room code." };
      }

      const rtf = htmlToRtf(payload.html);
      try {
        await upload({
          roomCode,
          fileName: rtfFileName(payload.subject),
          contentType: SPEECHDROP_UPLOAD_MIME,
          contentBase64: encodeBase64Utf8(rtf),
        });
        setLastRoomCode(roomCode);
        return {
          ok: true,
          message: `Uploaded to SpeechDrop room ${roomCode}.`,
        };
      } catch (error) {
        // Log the raw error for diagnosis; surface only its message, which is a
        // curated Rust-side failure string (bad room code, offline, …) or the
        // IPC layer's friendly "desktop app only" guard - never a raw internal
        // exception, since the IPC boundary rejects the plain-browser case with a
        // readable reason before `invoke` can throw its TypeError.
        console.error("SpeechDrop export failed:", error);
        const reason = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          message: reason || "Could not upload to SpeechDrop.",
        };
      }
    },
  };
}
