import { useContext, useMemo, useState } from "react";

import {
  createPreferenceStore,
  usePreferenceValue,
  PreferenceStoreContext,
  type PreferenceStore,
} from "../../preferences";
import {
  registerShorthandSection,
  SHORTHAND_SCOPE_KEY,
} from "../preferences";
import { type ShorthandScope } from "../scope";

/**
 * Reads the live configured {@link ShorthandScope} off the shared preference
 * store and re-renders the caller when it changes in Settings - so a scope edit
 * takes effect on the next transition without a reload.
 *
 * It registers the shorthand section on first use (idempotent, so it composes with
 * the Settings contribution that registers the same section) and rides the store's
 * `usePreferenceValue` seam. Provider-tolerant like {@link ../../formatting/react},
 * the useFormattingProfile hook: with no {@link PreferenceStoreProvider} it falls
 * back to a private, never-mutated store and reports {@link DEFAULT_SHORTHAND_SCOPE}.
 */
export function useShorthandScope(): ShorthandScope {
  const context = useContext(PreferenceStoreContext);
  // Stable private fallback for a bare tree; never mutated, so it always reports
  // the default scope. Created unconditionally (hooks must be) but unused when a
  // provider exists.
  const [fallback] = useState<PreferenceStore>(() => createPreferenceStore());
  const store = context?.store ?? fallback;

  const handle = useMemo(() => registerShorthandSection(store), [store]);
  return usePreferenceValue(handle, SHORTHAND_SCOPE_KEY);
}
