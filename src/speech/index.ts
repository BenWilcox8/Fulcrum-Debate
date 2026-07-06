/**
 * The **Auto Speech** engine's public surface.
 *
 * {@link ./transform | transformToSpeech} is the pure, framework-agnostic core that
 * turns card / selection content into speech-ready document-JSON. It is a shared
 * dependency: the Auto Speech clipboard toolbar tool, the ToC-checkbox speech
 * pipeline, and the drag-to-speech pipeline all call it, so it deliberately carries
 * no React, no toolbar coupling, and no editor mutation. See the module for the
 * full transform contract.
 */
export {
  transformToSpeech,
  DEFAULT_SPEECH_SEPARATOR,
  type SpeechTransformOptions,
} from "./transform";
