import { useContext } from "react";

import type { ShorthandLookup } from "../expand";
import { ShorthandDictionaryContext } from "./ShorthandDictionaryContext";

/**
 * The live dictionary lookup, or `null` outside a {@link ShorthandProvider}.
 * Provider-tolerant on purpose: a surface rendered without the provider (a bare
 * test tree, or `App` before the provider is mounted around it) gets `null` and
 * simply runs with expansion off, rather than throwing.
 */
export function useShorthandDictionary(): ShorthandLookup | null {
  return useContext(ShorthandDictionaryContext)?.lookup ?? null;
}
