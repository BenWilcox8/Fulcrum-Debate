import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  openShorthandDictionary,
  seedShorthandDictionary,
  type ShorthandDictionary,
} from "../dictionary";
import { ShorthandDictionaryContext } from "./ShorthandDictionaryContext";

/**
 * Owns the app's single {@link ShorthandDictionary} and provides its `lookup` to
 * the shorthand hooks. Mount it high in the tree (outside `App`, alongside
 * {@link ../../documents/react.DocumentsProvider}) so every text surface shares one
 * dictionary and so a bare `App` render (the offline-boot guard) constructs none.
 *
 * Opening the dictionary only binds a local IndexedDB-backed Y.Doc - it awaits no
 * network - so it is safe above the boot path. Until the management UI (SH2) lands
 * there is no way to populate the dictionary, so this provider **seeds the default
 * abbreviation set** on open (idempotent and non-clobbering, so a user-set entry is
 * never overwritten); a fresh dictionary is therefore immediately useful. When the
 * SH2 management surface arrives, this seeding is the one place to reconsider.
 */
export function ShorthandProvider({ children }: { children: ReactNode }) {
  const [dictionary, setDictionary] = useState<ShorthandDictionary>(() =>
    openShorthandDictionary(),
  );

  useEffect(() => {
    // Mirror DocumentsProvider's StrictMode discipline: the cleanup closes the
    // dictionary, so a remount that lands on a closed instance mints a fresh one.
    let current = dictionary;
    if (current.closed) {
      current = openShorthandDictionary();
      setDictionary(current);
      return;
    }
    // Seed once the local load resolves so the seed writes over a fully-read
    // dictionary (never clobbering a persisted user entry).
    void current.whenLoaded.then(() => {
      if (!current.closed) seedShorthandDictionary(current);
    });
    return () => {
      void current.close();
    };
  }, [dictionary]);

  // `lookup` is a stable bound closure over the dictionary, so the context value
  // only changes when the dictionary instance is swapped (a StrictMode remount).
  const value = useMemo(
    () => ({ lookup: dictionary.lookup }),
    [dictionary],
  );

  return (
    <ShorthandDictionaryContext.Provider value={value}>
      {children}
    </ShorthandDictionaryContext.Provider>
  );
}
