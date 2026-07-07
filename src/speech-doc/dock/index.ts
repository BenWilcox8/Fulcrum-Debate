/**
 * The Speech Doc **split-screen docking** layer (slice 2/2 of the Speech Doc
 * Editor & Split-Screen Docking PRD).
 *
 * {@link SpeechDockLayout} is the one component a screen mounts: it docks the
 * Speech Doc editor beside its flow-sheet `children` in a resizable split whose
 * edge (side/bottom) and size persist locally. It composes:
 *
 * - {@link ./dock-layout} - the pure layout model (position + fractional size).
 * - {@link ./dock-layout-storage} + {@link useDockLayout} - local persistence so
 *   the preference survives a reload.
 * - {@link SplitDock} - the generic resizable two-pane split with a draggable,
 *   keyboard-operable divider.
 * - {@link SpeechDock} - the docked pane: the active speech doc's editor plus the
 *   chrome that indicates and switches which speech is docked.
 */
export {
  DEFAULT_DOCK_LAYOUT,
  DEFAULT_DOCK_SIZES,
  DOCK_POSITIONS,
  MIN_DOCK_SIZE,
  MAX_DOCK_SIZE,
  clampDockSize,
  dockSizeFor,
  normalizeDockLayout,
  type DockLayout,
  type DockPosition,
} from "./dock-layout";
export {
  DOCK_LAYOUT_STORAGE_KEY,
  readDockLayout,
  writeDockLayout,
  type DockLayoutStorage,
} from "./dock-layout-storage";
export { dockSizeFromPointer, type SplitRect } from "./split-drag";
export { useDockLayout, type UseDockLayoutResult } from "./useDockLayout";
export { SplitDock, type SplitDockProps } from "./SplitDock";
export { SpeechDock, type SpeechDockProps } from "./SpeechDock";
export {
  SpeechDockLayout,
  type SpeechDockLayoutProps,
} from "./SpeechDockLayout";
