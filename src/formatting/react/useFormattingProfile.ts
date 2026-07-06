import { useContext, useMemo, useState } from "react";

import {
  createPreferenceStore,
  useSection,
  type PreferenceStore,
} from "../../preferences";
import { PreferenceStoreContext } from "../../preferences/react/PreferenceStoreContext";
import { registerFormattingSection } from "../preferences";
import { type FormattingProfile } from "../profile";

/**
 * Reads the live, merged {@link FormattingProfile} off the shared preference
 * store and re-renders the caller whenever any formatting target is edited - the
 * reactive read that makes card rendering update live without a reload.
 *
 * It registers the formatting section on first use (registration is idempotent,
 * so this composes safely with the Settings panel slice, which registers the
 * same section) and then subscribes through the store's own `useSection` seam.
 *
 * ## Provider-tolerant, like the dashboard's resume reader
 *
 * The block-file screen is not boot-path code, but its tests (and any bare
 * subtree) may render it without a {@link PreferenceStoreProvider}. Rather than
 * throw like {@link usePreferenceStore}, this hook falls back to a private,
 * app-standard store when no provider is present, so a card still renders to the
 * {@link DEFAULT_FORMATTING_PROFILE default standard}. The fallback store is
 * created once (a lazy initializer) so hooks stay unconditional and its
 * reference is stable; with no edits it simply reports the standard forever.
 */
export function useFormattingProfile(): FormattingProfile {
  const context = useContext(PreferenceStoreContext);
  // Stable private fallback for a bare tree; never mutated, so it reports the
  // standard profile. Created even when a provider exists (hooks are
  // unconditional) but then unused.
  const [fallback] = useState<PreferenceStore>(() => createPreferenceStore());
  const store = context?.store ?? fallback;

  const handle = useMemo(() => registerFormattingSection(store), [store]);
  // The section's value snapshot *is* a FormattingProfile (its keys are the
  // formatting targets); useSection keeps the reference stable between edits and
  // refreshes it on every set/reset, so rendering updates live.
  return useSection(handle);
}
