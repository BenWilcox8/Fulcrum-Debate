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
