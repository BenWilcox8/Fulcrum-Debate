import { useDocument } from "../../documents/react";
import { useActiveSpeechDoc } from "../active-speech-doc-context";
import { SpeechDocEditor } from "../SpeechDocEditor";
import { useSpeechDocs } from "../speech-doc";
import { DOCK_POSITIONS, type DockPosition } from "./dock-layout";

/** Human labels for each dock edge, used on the position toggle. */
const POSITION_LABELS: Record<DockPosition, string> = {
  side: "Side",
  bottom: "Bottom",
};

/** Props for {@link SpeechDock}. */
export interface SpeechDockProps {
  /** The current dock edge (drives the toggle's pressed state). */
  position: DockPosition;
  /** Switches the dock edge. */
  onPositionChange: (position: DockPosition) => void;
  /** Collapses the dock (hides it, giving the flow full space). */
  onClose?: () => void;
}

/**
 * The docked **Speech Doc** pane: the editor for the {@link useActiveSpeechDoc |
 * active speech doc}, plus the dock's own chrome (which speech is docked, the
 * dock-edge toggle, and a collapse control).
 *
 * The header is where the **active speech doc is clearly indicated**: a labelled
 * `<select>` shows and lets the debater switch which speech is docked (choosing
 * one sets it active), and the active title is echoed in a live status line, so
 * there is never ambiguity about which speech content pipelines target. Picking a
 * speech mounts {@link SpeechDocEditor} for it, which also re-affirms it as the
 * active speech doc.
 *
 * The dock owns no document state - it opens the active speech doc through the
 * shared {@link useDocument} service by id, exactly like the routed screen - so
 * it composes cleanly beside the flow without touching flowing.
 */
export function SpeechDock({ position, onPositionChange, onClose }: SpeechDockProps) {
  const { speechDocs } = useSpeechDocs();
  const { activeId, setActiveId } = useActiveSpeechDoc();
  const { handle } = useDocument(activeId);

  const activeDoc = speechDocs.find((doc) => doc.id === activeId) ?? null;

  return (
    <section
      aria-label="Speech dock"
      data-testid="speech-dock"
      className={`flex h-full min-h-0 min-w-0 flex-col bg-shell-bg ${position === "bottom" ? "border-t border-shell-border" : "border-l border-shell-border"}`}
    >
      <header className="flex flex-col gap-2 border-b border-shell-border bg-shell-surface px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-shell-muted">
              Speech
            </span>
            <label className="sr-only" htmlFor="speech-dock-select">
              Active speech doc
            </label>
            <select
              id="speech-dock-select"
              aria-label="Active speech doc"
              value={activeId ?? ""}
              onChange={(event) =>
                setActiveId(event.target.value === "" ? null : event.target.value)
              }
              className="rounded border border-shell-border bg-shell-surface px-2 py-1 text-sm text-shell-text"
            >
              <option value="">Select a speech…</option>
              {speechDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <div
              role="group"
              aria-label="Dock position"
              className="flex overflow-hidden rounded border border-shell-border"
            >
              {DOCK_POSITIONS.map((pos) => {
                const active = pos === position;
                return (
                  <button
                    key={pos}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onPositionChange(pos)}
                    className={`px-2 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "bg-shell-text text-shell-surface"
                        : "bg-shell-surface text-shell-muted hover:text-shell-text"
                    }`}
                  >
                    {POSITION_LABELS[pos]}
                  </button>
                );
              })}
            </div>
            {onClose ? (
              <button
                type="button"
                aria-label="Close speech dock"
                onClick={onClose}
                className="rounded px-2 py-1 text-xs font-medium text-shell-muted hover:text-shell-text"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>

        {/* The clear active-doc indication: which speech pipelines target. */}
        <p
          data-testid="active-speech-doc-indicator"
          aria-live="polite"
          className="truncate text-sm text-shell-text"
        >
          {activeDoc ? (
            <>
              <span className="text-shell-muted">Active speech: </span>
              <span className="font-semibold">{activeDoc.title}</span>
            </>
          ) : (
            <span className="text-shell-muted">No active speech</span>
          )}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {activeId ? (
          <SpeechDocEditor
            handle={handle}
            docId={activeId}
            className="h-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-shell-muted">
            Select a speech above to dock it beside the flow, or create one from
            the Speeches screen.
          </div>
        )}
      </div>
    </section>
  );
}
