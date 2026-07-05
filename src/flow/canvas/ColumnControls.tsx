import { useEffect, useState } from "react";

import type { DocumentHandle } from "../../documents/core";
import {
  addColumn,
  moveColumn,
  relabelColumn,
  removeColumn,
  type FlowSide,
  type SpeechColumn,
} from "../columns";
import { useColumns } from "./useColumns";

/**
 * The column-management strip for a flow sheet: the *write* path the render-only
 * canvas lacks. It sits alongside {@link FlowCanvas} and drives the flow-sheet
 * model helpers directly - {@link addColumn}, {@link relabelColumn},
 * {@link moveColumn}, {@link removeColumn} - so every gesture persists to
 * IndexedDB and the canvas updates live through the shared `observeColumns`
 * seam. It owns no column state of its own; the current list comes from
 * {@link useColumns} (the same observe seam the canvas reads), so the two never
 * drift.
 *
 * The UI is deliberately minimal and idiomatic to the app shell (design-token
 * classes, no bespoke toolbar chrome): an add form (side + label) and, per
 * column, an inline label editor, left/right reorder buttons, and a remove
 * button. Reordering is button-driven rather than drag-and-drop - full column
 * drag is explicitly out of scope, and step buttons fit the shell's plain style
 * while still exercising {@link moveColumn}.
 */
export interface ColumnControlsProps {
  /**
   * The flow-sheet document to manage. `null` while the document is opening -
   * the strip renders its add form disabled until a handle arrives, never
   * awaiting the network.
   */
  handle: DocumentHandle | null;
  /** Class applied to the controls' wrapper. */
  className?: string;
}

/** Per-side classes for the side toggle, keyed off the debate-side tokens. */
const SIDE_TOGGLE_CLASSES: Record<
  FlowSide,
  { active: string; label: string }
> = {
  aff: { active: "bg-aff-strong text-shell-surface border-aff-strong", label: "Aff" },
  neg: { active: "bg-neg-strong text-shell-surface border-neg-strong", label: "Neg" },
};

const SIDES: readonly FlowSide[] = ["aff", "neg"];

export function ColumnControls({ handle, className }: ColumnControlsProps) {
  const columns = useColumns(handle);
  const [side, setSide] = useState<FlowSide>("aff");
  const [label, setLabel] = useState("");

  const trimmed = label.trim();
  const canAdd = handle !== null && trimmed.length > 0;

  const submitAdd = (event: React.FormEvent) => {
    event.preventDefault();
    if (!handle || trimmed.length === 0) return;
    addColumn(handle, { side, label: trimmed });
    setLabel("");
  };

  return (
    <div
      data-testid="column-controls"
      className={`flex flex-col gap-3 bg-shell-surface p-card text-shell-text ${className ?? ""}`}
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={submitAdd}
        aria-label="Add speech column"
      >
        <div className="flex overflow-hidden rounded-md border border-shell-border">
          {SIDES.map((option) => {
            const active = side === option;
            const toggle = SIDE_TOGGLE_CLASSES[option];
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setSide(option)}
                className={`px-3 py-1.5 text-sm font-medium ${
                  active ? toggle.active : "bg-shell-surface text-shell-muted"
                }`}
              >
                {toggle.label}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="New column label (e.g. 1AC)"
          aria-label="New column label"
          className="min-w-40 flex-1 rounded-md border border-shell-border px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={!canAdd}
          className="rounded-md bg-shell-text px-3 py-1.5 text-sm font-medium text-shell-surface disabled:opacity-40"
        >
          Add column
        </button>
      </form>

      {columns.length > 0 && (
        <ul className="flex flex-col gap-2">
          {columns.map((column, index) => (
            <ColumnRow
              key={column.id}
              handle={handle}
              column={column}
              index={index}
              count={columns.length}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Props for a single editable column row. */
interface ColumnRowProps {
  handle: DocumentHandle | null;
  column: SpeechColumn;
  index: number;
  count: number;
}

/**
 * One row of the controls: an inline label editor plus reorder/remove actions
 * for a single column. Split out so its label draft state is scoped per column
 * and reset cleanly when the underlying column changes.
 */
function ColumnRow({ handle, column, index, count }: ColumnRowProps) {
  const [draft, setDraft] = useState(column.label);

  // Keep the draft in sync when the column's label changes elsewhere (e.g. an
  // external edit or a reorder that reuses this row for a different column).
  useEffect(() => {
    setDraft(column.label);
  }, [column.label]);

  const commit = () => {
    if (!handle) return;
    const next = draft.trim();
    if (next.length === 0 || next === column.label) {
      setDraft(column.label);
      return;
    }
    relabelColumn(handle, column.id, next);
  };

  const dotClass = column.side === "aff" ? "bg-aff-strong" : "bg-neg-strong";

  return (
    <li
      data-testid="column-row"
      data-column-id={column.id}
      data-side={column.side}
      className="flex items-center gap-2 rounded-md border border-shell-border px-2 py-1.5"
    >
      <span
        aria-hidden
        className={`h-3 w-3 shrink-0 rounded-full ${dotClass}`}
      />
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setDraft(column.label);
            event.currentTarget.blur();
          }
        }}
        aria-label={`Label for ${column.label}`}
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-shell-border focus:border-shell-border"
      />
      <button
        type="button"
        onClick={() => handle && moveColumn(handle, column.id, index - 1)}
        disabled={!handle || index === 0}
        aria-label={`Move ${column.label} left`}
        className="rounded px-2 py-1 text-sm text-shell-muted hover:bg-shell-bg disabled:opacity-30"
      >
        ←
      </button>
      <button
        type="button"
        onClick={() => handle && moveColumn(handle, column.id, index + 1)}
        disabled={!handle || index === count - 1}
        aria-label={`Move ${column.label} right`}
        className="rounded px-2 py-1 text-sm text-shell-muted hover:bg-shell-bg disabled:opacity-30"
      >
        →
      </button>
      <button
        type="button"
        onClick={() => handle && removeColumn(handle, column.id)}
        disabled={!handle}
        aria-label={`Remove ${column.label}`}
        className="rounded px-2 py-1 text-sm text-neg-strong hover:bg-neg-soft disabled:opacity-30"
      >
        Remove
      </button>
    </li>
  );
}
