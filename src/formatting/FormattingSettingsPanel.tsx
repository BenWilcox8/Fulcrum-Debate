import { useSection } from "../preferences";
import type { SettingsPanelProps } from "../settings/types";
import {
  FONT_FAMILY_OPTIONS,
  FORMATTING_TARGET_KEYS,
  FORMATTING_TARGET_LABELS,
  type FormattingEntry,
  type FormattingTargetKey,
} from "./profile";
import type { FormattingSectionSchema } from "./preferences";

/**
 * The Settings panel for the evidence formatting profile (slice 4 of the
 * Evidence Formatting feature).
 *
 * It renders one editable control group per {@link FormattingTargetKey}, each
 * exposing the entry's font, size, colour, and the two style flags the standards
 * use (bold / underline). Every edit writes the *whole* {@link FormattingEntry}
 * back to that target's key, so a single object keeps driving rendering and the
 * Shrink tool. Reads ride {@link useSection}, so a change re-renders this panel
 * and any other consumer live - open documents restyle without a restart. The
 * per-section "Reset to defaults" control comes from the Settings shell.
 *
 * Controls are native inputs only (no colour-picker library): a `<datalist>`
 * offers the shared font families while still allowing any typed family, size is
 * a numeric point control, and colour is the native swatch.
 */

/** The datalist id shared by every target's font suggestion list. */
const FONT_DATALIST_ID = "formatting-font-family-options";

/** Parses the numeric part of a point-string size (`"12pt"` → `12`). */
function pointSizeToNumber(fontSize: string): number {
  const parsed = Number.parseFloat(fontSize);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function FormattingSettingsPanel({
  handle,
}: SettingsPanelProps<FormattingSectionSchema>) {
  const values = useSection(handle);

  // Every control edits exactly one field of one target's entry; the entry is a
  // whole object under its key, so we spread the live value and patch it.
  const patchEntry = (
    key: FormattingTargetKey,
    patch: Partial<FormattingEntry>,
  ) => {
    handle.set(key, { ...values[key], ...patch });
  };

  return (
    <div className="flex flex-col gap-section">
      <p className="max-w-prose text-sm text-shell-muted">
        Set the font, size, and colour for each part of a card. These standards
        apply live to open documents as you change them.
      </p>

      <datalist id={FONT_DATALIST_ID}>
        {FONT_FAMILY_OPTIONS.map((family) => (
          <option key={family} value={family} />
        ))}
      </datalist>

      {FORMATTING_TARGET_KEYS.map((key) => {
        const entry = values[key];
        const label = FORMATTING_TARGET_LABELS[key];
        return (
          <fieldset
            key={key}
            className="flex flex-col gap-3 rounded-lg border border-shell-border bg-shell-surface p-card"
          >
            <legend className="px-1 text-sm font-semibold text-shell-text">
              {label}
            </legend>

            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-shell-muted">
                Font
                <input
                  type="text"
                  list={FONT_DATALIST_ID}
                  value={entry.fontFamily}
                  onChange={(event) =>
                    patchEntry(key, { fontFamily: event.target.value })
                  }
                  className="w-44 rounded border border-shell-border bg-shell-surface px-2 py-1 text-sm text-shell-text"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-shell-muted">
                Size (pt)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={pointSizeToNumber(entry.fontSize)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") return;
                    patchEntry(key, { fontSize: `${raw}pt` });
                  }}
                  className="w-20 rounded border border-shell-border bg-shell-surface px-2 py-1 text-sm text-shell-text"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-shell-muted">
                Color
                <input
                  type="color"
                  value={entry.color}
                  onChange={(event) =>
                    patchEntry(key, { color: event.target.value })
                  }
                  className="h-8 w-12 rounded border border-shell-border bg-shell-surface"
                />
              </label>

              <label className="flex items-center gap-2 self-center pt-4 text-sm text-shell-text">
                <input
                  type="checkbox"
                  checked={entry.bold}
                  onChange={(event) =>
                    patchEntry(key, { bold: event.target.checked })
                  }
                  className="h-4 w-4 accent-aff-strong"
                />
                Bold
              </label>

              <label className="flex items-center gap-2 self-center pt-4 text-sm text-shell-text">
                <input
                  type="checkbox"
                  checked={entry.underline}
                  onChange={(event) =>
                    patchEntry(key, { underline: event.target.checked })
                  }
                  className="h-4 w-4 accent-aff-strong"
                />
                Underline
              </label>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
