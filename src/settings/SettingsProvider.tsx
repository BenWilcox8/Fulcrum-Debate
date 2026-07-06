import { useState, type ReactNode } from "react";

import { usePreferenceStore } from "../preferences";
import { SettingsPanelsContext } from "./SettingsPanelsContext";
import type {
  SettingsContribution,
  SettingsPanel,
  SettingsPanelRegistry,
} from "./types";

/**
 * Wires each feature's {@link SettingsContribution} into the app: it registers
 * every contribution's section against the shared preference store and exposes
 * the contributed panels to the Settings shell.
 *
 * This is the single seam where the app collects what the Settings screen shows.
 * Real feature slices (formatting, tools, shorthand, ...) add their own entries
 * to the `contributions` list; this slice ships only the demo contribution.
 *
 * Registration happens once, in a lazy `useState` initializer, so the sections
 * exist on the store before the shell (a descendant) first reads
 * `listSections()`. `registerSection` is idempotent for a matching schema, so a
 * StrictMode double-invoke or hot-reload re-run is safe and preserves any values
 * already set.
 */
export function SettingsProvider({
  contributions,
  children,
}: {
  contributions: readonly SettingsContribution[];
  children: ReactNode;
}) {
  const store = usePreferenceStore();

  const [panels] = useState<SettingsPanelRegistry>(() => {
    const registry: Record<string, SettingsPanel> = {};
    for (const { definition, panel } of contributions) {
      store.registerSection(definition);
      if (panel) {
        registry[definition.id] = panel as SettingsPanel;
      }
    }
    return registry;
  });

  return (
    <SettingsPanelsContext.Provider value={panels}>
      {children}
    </SettingsPanelsContext.Provider>
  );
}
