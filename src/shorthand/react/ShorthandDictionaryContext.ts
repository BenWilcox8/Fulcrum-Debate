import { createContext } from "react";

import type { ShorthandLookup } from "../expand";

/** Value exposed by {@link ShorthandProvider} to the shorthand hooks. */
export interface ShorthandDictionaryContextValue {
  /**
   * The live, exact-match dictionary lookup the engine expands against - a stable
   * bound closure over the app's single {@link ../dictionary.ShorthandDictionary}.
   * Reads before the local load resolves simply see an empty dictionary.
   */
  readonly lookup: ShorthandLookup;
}

/**
 * `null` outside a {@link ShorthandProvider} so {@link useShorthandDictionary}
 * degrades to "no dictionary" (expansion off) rather than throwing - the same
 * provider-tolerant discipline the dashboard's resume reader and the formatting
 * hook use, so a bare subtree (e.g. `App.offline-boot.test`, which renders `App`
 * without the provider mounted outside it) still paints.
 */
export const ShorthandDictionaryContext =
  createContext<ShorthandDictionaryContextValue | null>(null);
