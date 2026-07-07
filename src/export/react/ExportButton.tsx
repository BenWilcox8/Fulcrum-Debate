import { useCallback, useState } from "react";

import type { ExportPayload, ExportTarget } from "../target";
import { DEFAULT_EXPORT_TARGETS } from "../email-target";

/** Props for {@link ExportButton}. */
export interface ExportButtonProps {
  /**
   * Assembles the payload for the current surface, called on click. Lazy (not a
   * prop value) so the document is serialized only when the user exports, and
   * always from the latest content. Return `null` when there is nothing to
   * export (e.g. the handle is not ready) - the action reports a gentle no-op.
   */
  buildPayload: () => ExportPayload | null;
  /** The targets to offer. Defaults to {@link DEFAULT_EXPORT_TARGETS} (Email). */
  targets?: readonly ExportTarget[];
  /** Disables the action (e.g. while the document is still opening). */
  disabled?: boolean;
  /** Class applied to the action's container. */
  className?: string;
}

/** Transient feedback shown after an export attempt. */
type ExportStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "done"; ok: boolean; message: string };

/**
 * The **one-click Export action** mounted on the speech doc and block file
 * surfaces.
 *
 * It renders one button per {@link ExportTarget} (a single "Export to Email"
 * button today; a second appears the moment SpeechDrop is added to the list),
 * plus a `role="status"` `aria-live` line for **non-intrusive success/failure
 * feedback** - the same subtle, inline affordance the send controls use, never a
 * modal or a toast.
 *
 * On click it assembles the payload lazily via `buildPayload`, hands it to the
 * chosen target, and reports the target's {@link ExportResult}. A target that
 * fails resolves `ok: false` (it does not throw), so a missing mail client shows
 * a readable line rather than breaking the surface. Buttons disable while an
 * export is in flight so a double-click cannot open two drafts.
 */
export function ExportButton({
  buildPayload,
  targets = DEFAULT_EXPORT_TARGETS,
  disabled = false,
  className,
}: ExportButtonProps) {
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });

  const runExport = useCallback(
    async (target: ExportTarget) => {
      const payload = buildPayload();
      if (!payload) {
        setStatus({ kind: "done", ok: false, message: "Nothing to export yet." });
        return;
      }
      setStatus({ kind: "pending" });
      const result = await target.export(payload);
      setStatus({ kind: "done", ok: result.ok, message: result.message });
    },
    [buildPayload],
  );

  const pending = status.kind === "pending";

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            disabled={disabled || pending}
            onClick={() => void runExport(target)}
            className="shrink-0 rounded border border-shell-border bg-shell-surface px-3 py-1.5 text-sm font-medium text-shell-text hover:bg-shell-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export to {target.label}
          </button>
        ))}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`mt-1 min-h-[1.25rem] text-xs ${
          status.kind === "done" && !status.ok
            ? "text-neg-strong"
            : "text-shell-muted"
        }`}
      >
        {status.kind === "done" ? status.message : ""}
      </p>
    </div>
  );
}
