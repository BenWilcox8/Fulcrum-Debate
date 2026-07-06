import { useContext } from "react";
import { SettingsPanelsContext } from "./SettingsPanelsContext";
import type { SettingsPanelRegistry } from "./types";

/**
 * Returns the contributed-panel registry for the Settings shell, keyed by
 * section id. Empty when no {@link SettingsProvider} is mounted, so the shell
 * degrades to placeholder bodies rather than throwing.
 */
export function useSettingsPanels(): SettingsPanelRegistry {
  return useContext(SettingsPanelsContext);
}
