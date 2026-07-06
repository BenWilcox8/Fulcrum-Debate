import { useMemo, useState, type ReactNode } from "react";
import { createPreferenceStore, type PreferenceStore } from "../store";
import { PreferenceStoreContext } from "./PreferenceStoreContext";

/**
 * Owns one {@link PreferenceStore} for the whole app and provides it to the
 * tree via the store hooks ({@link usePreferenceStore}, {@link useSection},
 * {@link usePreferenceValue}).
 *
 * The store is a pure, in-memory section registry - creating it awaits nothing
 * (no network, no disk), so children render immediately with no gate. Pass an
 * explicit `store` to share one created elsewhere (tests, or a store already
 * wired to persistence); otherwise the provider mints one on first render and
 * keeps it stable for the provider's lifetime.
 */
export function PreferenceStoreProvider({
  children,
  store,
}: {
  children: ReactNode;
  store?: PreferenceStore;
}) {
  // A lazy initializer keeps the fallback store stable across re-renders; when
  // an explicit store is passed we adopt it and never mint our own.
  const [ownStore] = useState<PreferenceStore>(
    () => store ?? createPreferenceStore(),
  );
  const resolvedStore = store ?? ownStore;
  const contextValue = useMemo(() => ({ store: resolvedStore }), [resolvedStore]);

  return (
    <PreferenceStoreContext.Provider value={contextValue}>
      {children}
    </PreferenceStoreContext.Provider>
  );
}
