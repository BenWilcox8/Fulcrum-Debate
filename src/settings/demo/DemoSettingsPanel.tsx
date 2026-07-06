import { useSection } from "../../preferences";
import type { SettingsPanelProps } from "../types";
import type { demoSectionFields } from "./demoSettings";

/**
 * The demo section's panel: reads its section's live values and toggles one of
 * them, proving a contributed panel renders and reacts through the store's
 * subscription seam. Split into its own file so the section-definition module
 * stays free of component exports (react-refresh only-export-components).
 */
export function DemoSettingsPanel({
  handle,
}: SettingsPanelProps<typeof demoSectionFields>) {
  const values = useSection(handle);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-shell-text">{values.message}</p>
      <label className="flex items-center gap-2 text-sm text-shell-text">
        <input
          type="checkbox"
          checked={values.enabled}
          onChange={(event) => handle.set("enabled", event.target.checked)}
          className="h-4 w-4 accent-aff-strong"
        />
        Enabled
      </label>
    </div>
  );
}
