/**
 * The speech-doc track's model surface.
 *
 * A speech doc is a `speech-doc` document (see {@link ./speech-doc}); this module
 * maps the concept onto the shared document layer with no new infrastructure -
 * {@link useSpeechDocs} lists/creates/removes them and the shell opens one's body
 * through the document service by id.
 *
 * The **active speech doc** ({@link ./active-speech-doc}) is the track's key
 * shared surface: the model-level pointer to which speech doc content pipelines
 * (Send Flow, ToC, drag-to-speech - each a later PRD) target. Read/observe it via
 * {@link useActiveSpeechDoc} (or the raw {@link useActiveSpeechDocStore} for
 * imperative use); the app publishes one store via {@link ActiveSpeechDocProvider}.
 *
 * {@link SpeechDocEditor} is the editable surface - a shared-Tiptap-core instance
 * bound to the speech doc's body - which also marks its doc active on mount.
 */
export {
  SPEECH_DOC_KIND,
  SPEECH_DOC_BODY_FRAGMENT,
  defaultSpeechDocTitle,
  useSpeechDocs,
  type SpeechDoc,
  type UseSpeechDocsResult,
} from "./speech-doc";
export {
  createActiveSpeechDocStore,
  type ActiveSpeechDocStore,
} from "./active-speech-doc";
export {
  ActiveSpeechDocContext,
  useActiveSpeechDocStore,
  useActiveSpeechDoc,
  type UseActiveSpeechDocResult,
} from "./active-speech-doc-context";
export {
  ActiveSpeechDocProvider,
  type ActiveSpeechDocProviderProps,
} from "./ActiveSpeechDocProvider";
export {
  SpeechDocEditor,
  type SpeechDocEditorProps,
} from "./SpeechDocEditor";
