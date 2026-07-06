import { createContext } from "react";
import type { SettingsPanelRegistry } from "./types";

/**
 * The panel registry the Settings shell reads, keyed by section id and supplied
 * by {@link SettingsProvider}. Defaults to an empty registry so a section
 * always resolves to "no contributed panel" rather than crashing when the shell
 * is mounted without a provider (e.g. isolated tests).
 */
export const SettingsPanelsContext = createContext<SettingsPanelRegistry>({});
