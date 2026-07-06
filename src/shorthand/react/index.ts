/**
 * React bindings for the Shorthand Engine: the app-lifetime dictionary provider
 * and the surface-generic hook a text surface uses to run scope-gated expansion on
 * its own editor. Kept in `./react` so the shorthand model index stays free of
 * React (imported directly, like `src/formatting/react`).
 */
export { ShorthandProvider } from "./ShorthandProvider";
export { ShorthandDictionaryContext } from "./ShorthandDictionaryContext";
export type { ShorthandDictionaryContextValue } from "./ShorthandDictionaryContext";
export { useShorthandDictionary } from "./useShorthandDictionary";
export { useShorthandScope } from "./useShorthandScope";
export { useSurfaceShorthand } from "./useSurfaceShorthand";
