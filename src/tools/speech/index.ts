/**
 * The **Auto Speech** clipboard card tool - model half.
 *
 * The pure ops ({@link buildSpeechPayload}, {@link copySpeechToClipboard},
 * {@link speechSelectionNode}, {@link writeSpeechToClipboard}) and the registry
 * {@link autoSpeechTool | tool definition} live here and are React-free, so
 * `src/tools` stays free of React (like the registry and the Send model half).
 * The interactive toolbar control ({@link ./AutoSpeechControl}) is exported from
 * `src/tools/react` alongside the toolbar it plugs into.
 */
export {
  AUTO_SPEECH_TOOL_ID,
  AUTO_SPEECH_TOOL_LABEL,
  autoSpeechTool,
  buildSpeechPayload,
  copySpeechToClipboard,
  writeSpeechToClipboard,
  speechSelectionNode,
  type AutoSpeechToolSettings,
  type SpeechClipboardPayload,
  type SpeechCopyResult,
} from "./auto-speech";
