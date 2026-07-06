import { HashRouter } from "react-router-dom";
import AppRoutes from "./AppRoutes";
import { PreferenceStoreProvider } from "./preferences";
import { SettingsProvider, SETTINGS_CONTRIBUTIONS } from "./settings";

/**
 * The application shell. A HashRouter drives client-side navigation, which
 * works under Tauri's file:// context (no server to resolve real paths) and
 * renders entirely offline with no network dependency.
 *
 * The preference store and settings contributions wrap the router so the
 * Settings screen can list registered sections and render their contributed
 * panels. Both are pure and in-memory (no network, no disk), so they sit on the
 * boot path without violating the local-first boot rule.
 */
export default function App() {
  return (
    <PreferenceStoreProvider>
      <SettingsProvider contributions={SETTINGS_CONTRIBUTIONS}>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </SettingsProvider>
    </PreferenceStoreProvider>
  );
}
