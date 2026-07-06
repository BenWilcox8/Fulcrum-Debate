import { useState, type ReactNode } from "react";

import { SpeechDock } from "./SpeechDock";
import { SplitDock } from "./SplitDock";
import { useDockLayout } from "./useDockLayout";
import type { DockLayoutStorage } from "./dock-layout-storage";

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
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <div className={`relative min-h-0 min-w-0 flex-1 ${className ?? ""}`}>
        {children}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute bottom-3 left-3 z-20 rounded-md border border-shell-border bg-shell-surface px-3 py-1.5 text-sm font-medium text-shell-text shadow-md hover:border-shell-muted"
        >
          Open speech dock
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
