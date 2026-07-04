import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_PREFERENCES,
  getPreferences,
  setPreferences,
  type Preferences,
} from "../ipc";
import { PreferencesContext } from "./PreferencesContext";

/**
 * Loads persisted preferences from the Rust-owned store and exposes them to the
 * tree via {@link usePreferences}.
 *
 * The initial render uses {@link DEFAULT_PREFERENCES} synchronously, so nothing
 * in the boot path awaits the store read (which is local disk, never network).
 * The persisted values are folded in once the read resolves.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferencesState] =
    useState<Preferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  // Guards against a late store read overwriting state after unmount.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getPreferences()
      .then((loaded) => {
        if (active) setPreferencesState(loaded);
      })
      .catch(() => {
        // The store resolves to defaults on the Rust side for missing/corrupt
        // files; a rejection here means a broken environment. Keep the
        // in-memory defaults rather than crashing the app.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updatePreferences = useCallback(
    async (patch: Partial<Preferences>) => {
      const next = { ...preferences, ...patch };
      const saved = await setPreferences(next);
      if (mounted.current) setPreferencesState(saved);
    },
    [preferences],
  );

  return (
    <PreferencesContext.Provider
      value={{ preferences, loading, updatePreferences }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}
