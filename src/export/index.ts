/**
 * The **Export & Sharing** feature (slice 1/2): a one-click Export action on the
 * speech doc and block file surfaces, per-surface payload assembly, and a
 * pluggable target boundary. Email ships now; SpeechDrop plugs into the same
 * {@link ExportTarget} boundary next slice without reworking the action.
 *
 * The React layer lives in `src/export/react` and is imported from there, so this
 * model index stays React-free.
 */
export type {
  ExportPayload,
  ExportResult,
  ExportTarget,
} from "./target";
export {
  buildExportPayload,
  buildSpeechDocExportPayload,
  buildBlockFileExportPayload,
} from "./payload";
export {
  createEmailTarget,
  emailTarget,
  DEFAULT_EXPORT_TARGETS,
  mailtoUrl,
  EMAIL_TARGET_ID,
  EMAIL_TARGET_LABEL,
  type OpenUrl,
} from "./email-target";
