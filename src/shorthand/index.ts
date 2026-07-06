/**
 * The Shorthand Engine: an abbreviation -> expansion dictionary and the engine
 * that rewrites abbreviations in just-completed text at a box/argument
 * transition. See {@link ./dictionary} (the persisted model) and {@link ./expand}
 * (the surface-agnostic expansion engine).
 */
export {
  SHORTHAND_DB_NAME,
  DEFAULT_SHORTHAND_ENTRIES,
  openShorthandDictionary,
  seedShorthandDictionary,
  type ShorthandDictionary,
  type ShorthandEntry,
} from "./dictionary";
export {
  TOKEN_PATTERN,
  expandText,
  expandCompletedText,
  expandThen,
  type ShorthandLookup,
} from "./expand";
export {
  SHORTHAND_SCOPES,
  DEFAULT_SHORTHAND_SCOPE,
  isShorthandEnabledForSurface,
  type ShorthandScope,
  type ShorthandSurface,
} from "./scope";
export {
  SHORTHAND_SECTION_ID,
  SHORTHAND_SCOPE_KEY,
  shorthandSectionDefinition,
  registerShorthandSection,
  readShorthandScope,
  type ShorthandSectionSchema,
  type ShorthandSectionHandle,
} from "./preferences";
export {
  SHORTHAND_STORAGE_KEY,
  shorthandRuntimeExtension,
  getShorthandRuntime,
  setShorthandRuntime,
  expandTransition,
  type ShorthandRuntime,
} from "./runtime";
