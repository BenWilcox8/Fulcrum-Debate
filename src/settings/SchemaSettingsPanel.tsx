import { useState } from "react";
import { useSection } from "../preferences";
import type { PreferenceField } from "../preferences";
import type { SettingsPanelProps } from "./types";

/**
 * A generic, schema-driven settings panel: it renders one native control per
 * field in a section's self-describing schema, reading and writing through the
 * section handle. A feature that has no bespoke panel needs (the card-cutting
 * tools are the first) can surface its settings by pointing its contribution at
 * this component - the section's own field metadata (label, description, default
 * type, enumerated `options`) fully determines the controls, so nothing is
 * hand-wired per feature.
 *
 * Controls are native inputs only, matching the formatting panel's style: a
 * `<select>` for an enumerated field, a checkbox for a boolean, a numeric input
 * for a number, and a text input otherwise. Reads ride {@link useSection}, so an
 * edit re-renders this panel and any other consumer live; the per-section
 * "Reset to defaults" control comes from the Settings shell.
 */
export function SchemaSettingsPanel({ handle }: SettingsPanelProps) {
  const values = useSection(handle);
  const fields = handle.definition.fields;

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(fields).map(([key, field]) => (
        <FieldControl
          key={key}
          fieldKey={key}
          field={field}
          value={values[key]}
          onChange={(next) => handle.set(key, next)}
        />
      ))}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: unknown) => void;
}) {
  const storedStr = String(value);
  const [raw, setRaw] = useState(storedStr);
  const [prevStored, setPrevStored] = useState(storedStr);
  if (storedStr !== prevStored) {
    setPrevStored(storedStr);
    setRaw(storedStr);
  }

  return (
    <input
      type="number"
      value={raw}
      onChange={(event) => {
        const next = event.target.value;
        setRaw(next);
        if (next !== "") {
          const parsed = Number(next);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }
      }}
      onBlur={() => {
        const parsed = Number(raw);
        if (raw === "" || Number.isNaN(parsed)) {
          setRaw(storedStr);
        }
      }}
      className="w-24 rounded border border-shell-border bg-shell-surface px-2 py-1 text-sm text-shell-text"
    />
  );
}

function FieldControl({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: PreferenceField<unknown>;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = field.label ?? fieldKey;
  const options = field.options;

  const control =
    options && options.length > 0 ? (
      <select
        value={String(value)}
        onChange={(event) => {
          const picked = options.find(
            (option) => String(option) === event.target.value,
          );
          if (picked !== undefined) onChange(picked);
        }}
        className="w-56 rounded border border-shell-border bg-shell-surface px-2 py-1 text-sm text-shell-text"
      >
        {options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {String(option)}
          </option>
        ))}
      </select>
    ) : typeof field.default === "boolean" ? (
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-aff-strong"
      />
    ) : typeof field.default === "number" ? (
      <NumberInput value={value as number} onChange={onChange} />
    ) : typeof field.default === "string" ? (
      <input
        type="text"
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
        className="w-56 rounded border border-shell-border bg-shell-surface px-2 py-1 text-sm text-shell-text"
      />
    ) : null;

  // Booleans read best with the label after the box; every other control reads
  // best with the label above it.
  const isCheckbox = !options && typeof field.default === "boolean";

  return (
    <div className="flex flex-col gap-1">
      <label
        className={
          isCheckbox
            ? "flex items-center gap-2 text-sm text-shell-text"
            : "flex flex-col gap-1 text-xs font-medium text-shell-muted"
        }
      >
        {isCheckbox ? (
          <>
            {control}
            <span className="text-sm text-shell-text">{label}</span>
          </>
        ) : (
          <>
            <span>{label}</span>
            {control ?? (
              <span className="text-sm text-shell-muted">
                No control available for this setting.
              </span>
            )}
          </>
        )}
      </label>
      {field.description && (
        <p className="max-w-prose text-xs text-shell-muted">
          {field.description}
        </p>
      )}
    </div>
  );
}
