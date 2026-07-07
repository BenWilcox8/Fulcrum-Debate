import { useEffect, useRef, useState, type ReactNode } from "react";

import { useActiveSpeechDoc } from "../active-speech-doc-context";
import { SpeechDock } from "./SpeechDock";
import { SplitDock } from "./SplitDock";
import { useDockLayout } from "./useDockLayout";
import type { DockLayoutStorage } from "./dock-layout-storage";

/**
 * Below this viewport width a side-by-side split leaves neither the flow nor the
 * dock enough room (a 40% dock on a 1024px screen starves the 5-column flow so
 * the timer widget overlaps its columns), so the dock starts *collapsed* there -
 * the flow gets the full width and the debater opens the dock deliberately via
 * the "Open speech dock" button. This is the initial default only; the dock is
 * always openable. On wider viewports the dock keeps its open-by-default
 * behaviour. 1100px is the smallest width at which a usable flow (~700px) and a
 * usable speech editor (~320px) coexist side by side.
 */
export const NARROW_DOCK_BREAKPOINT = 1100;

/**
 * Whether the viewport is too narrow for a comfortable side-by-side dock, read
 * once synchronously. Guarded so a non-browser environment (jsdom in unit tests,
 * where `matchMedia` is absent) resolves to "not narrow" - preserving the
 * open-by-default behaviour the dock tests assert.
 */
function isNarrowViewport(breakpoint = NARROW_DOCK_BREAKPOINT): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches;
}

/** Props for {@link SpeechDockLayout}. */
export interface SpeechDockLayoutProps {
  /** The main pane - the flow sheet (with its timer overlay) fills this. */
  children: ReactNode;
  /**
   * Storage override for the persisted dock layout (tests pass an isolated stub;
   * omit for the real `localStorage`).
   */
  storage?: DockLayoutStorage | null;
  /** Class applied to the layout's outer container. */
  className?: string;
}

/**
 * Docks the {@link SpeechDock | Speech Doc editor} alongside its flow-sheet
 * `children` in a resizable, position-remembering split - slice 2/2 of the
 * Speech Doc Editor & Split-Screen Docking PRD.
 *
 * The dock edge (side/bottom) and split size come from {@link useDockLayout},
 * which seeds from and persists to local storage, so the layout preference
 * survives a reload. Dragging the {@link SplitDock} divider commits new sizes
 * straight to that store. Whether the dock is *open* is session state (a debater
 * collapses it to reclaim the full flow for a moment) - deliberately not
 * persisted, mirroring the flow's transient collapse view-state.
 *
 * **An empty dock never starves the flow.** With no {@link useActiveSpeechDoc |
 * active speech doc}, the split would show only a "select a speech" placeholder
 * while consuming ~40% of the width, squeezing the flow columns for no benefit.
 * So the dock starts collapsed to a slim rail whenever nothing is docked (the
 * flow gets the full width) and **auto-expands to the split the moment a speech
 * becomes active** - whether the debater picks one from the rail's dock, or a
 * pipeline (Send Flow, ToC bulk-send) sets one active. A manual close returns to
 * the rail without fighting that auto-open (an unchanged active id never
 * re-opens a dock the debater just closed).
 *
 * The flow lives in the primary pane untouched, so every flow interaction (drag,
 * timers, argument rows) keeps working while docked; collapsing the dock returns
 * the flow to full width.
 */
export function SpeechDockLayout({
  children,
  storage,
  className,
}: SpeechDockLayoutProps) {
  const { layout, setPosition, setSize } = useDockLayout(storage);
  const { activeId } = useActiveSpeechDoc();
  // The split is worth its width only when a speech is actually docked, so it is
  // open by default only when a speech is already active *and* the viewport is
  // roomy enough for a side split (see NARROW_DOCK_BREAKPOINT). An empty dock
  // starts as a rail, keeping the flow at full width until the debater engages
  // it (D2).
  const [open, setOpen] = useState(
    () => activeId != null && !isNarrowViewport(),
  );

  // Auto-expand the moment a speech transitions from none to active, so appended
  // or selected speech content is visible without a manual open. Keyed on the
  // null -> non-null edge so it never re-opens a dock the debater deliberately
  // closed while a speech stayed active.
  const previousActiveId = useRef(activeId);
  useEffect(() => {
    if (activeId != null && previousActiveId.current == null) {
      setOpen(true);
    }
    previousActiveId.current = activeId;
  }, [activeId]);

  if (!open) {
    return (
      <div
        className={`relative flex min-h-0 min-w-0 flex-1 ${
          layout.position === "bottom" ? "flex-col" : "flex-row"
        } ${className ?? ""}`}
      >
        <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
        {/* A slim rail stands in for the collapsed dock: it consumes almost no
            space (the flow keeps effectively the whole viewport) while keeping
            the dock one click away and discoverable. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open speech dock"
          title="Open the speech dock"
          className={`flex shrink-0 items-center justify-center gap-1.5 bg-shell-surface text-xs font-semibold uppercase tracking-wide text-shell-muted hover:bg-shell-bg hover:text-shell-text ${
            layout.position === "bottom"
              ? "border-t border-shell-border px-3 py-1.5"
              : "w-7 flex-col border-l border-shell-border py-3"
          }`}
        >
          <span aria-hidden="true">{layout.position === "bottom" ? "▴" : "◂"}</span>
          <span
            className={
              layout.position === "bottom" ? "" : "[writing-mode:vertical-rl] rotate-180"
            }
          >
            Speech
          </span>
        </button>
      </div>
    );
  }

  return (
    <SplitDock
      className={`min-h-0 min-w-0 flex-1 ${className ?? ""}`}
      position={layout.position}
      size={layout.size}
      onSizeChange={setSize}
      primary={children}
      secondary={
        <SpeechDock
          position={layout.position}
          onPositionChange={setPosition}
          onClose={() => setOpen(false)}
        />
      }
    />
  );
}
