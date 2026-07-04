/**
 * Debounced persistence of the main window's geometry.
 *
 * The window's size and position are saved on every resize/move (debounced)
 * rather than only on a clean exit, so the last geometry survives a force-quit
 * or crash. Persistence flows through the typed IPC seam (`saveWindowGeometry`)
 * to the Rust side, which owns the on-disk file, defaults, and validation.
 *
 * The debounce logic lives in {@link createGeometryPersister}, which is pure and
 * unit-tested with a mocked save function. The `@tauri-apps/api/window` wiring
 * in {@link startWindowGeometryPersistence} needs the real webview and is not
 * exercised under Vitest.
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import { saveWindowGeometry, type WindowGeometry } from "./index";

/** Idle time after the last resize/move before geometry is written to disk. */
export const GEOMETRY_SAVE_DEBOUNCE_MS = 400;

/** Coalesces rapid geometry changes into a single debounced save. */
export interface GeometryPersister {
  /** Records the latest geometry and (re)starts the debounce timer. */
  schedule(geometry: WindowGeometry): void;
  /** Writes any pending geometry immediately, cancelling the timer. */
  flush(): void;
  /** Discards any pending geometry without saving. */
  cancel(): void;
}

/**
 * Creates a debounced persister around a `save` function.
 *
 * Only the most recent geometry within a debounce window is written, so a burst
 * of resize/move events collapses to a single save. `save` rejections are
 * swallowed: a failed geometry write must never surface to the user or break
 * the boot path.
 */
export function createGeometryPersister(
  save: (geometry: WindowGeometry) => Promise<void>,
  delayMs: number = GEOMETRY_SAVE_DEBOUNCE_MS,
): GeometryPersister {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: WindowGeometry | undefined;

  const write = () => {
    timer = undefined;
    if (pending === undefined) return;
    const geometry = pending;
    pending = undefined;
    void Promise.resolve(save(geometry)).catch(() => {
      // Persisting geometry is best-effort; ignore transient failures.
    });
  };

  return {
    schedule(geometry) {
      pending = geometry;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(write, delayMs);
    },
    flush() {
      if (timer !== undefined) clearTimeout(timer);
      write();
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
  };
}

/**
 * Starts saving the current window's geometry on every debounced resize/move.
 *
 * Reads size/position in logical pixels to match the Rust restore path, then
 * persists through the IPC seam. Returns a teardown function that detaches the
 * listeners and flushes any pending save. Intended to run only inside the Tauri
 * webview (guarded at the call site in `main.tsx`).
 */
export async function startWindowGeometryPersistence(): Promise<() => void> {
  const appWindow = getCurrentWindow();
  const persister = createGeometryPersister(saveWindowGeometry);

  const capture = async () => {
    const scaleFactor = await appWindow.scaleFactor();
    const size = (await appWindow.innerSize()).toLogical(scaleFactor);
    const position = (await appWindow.outerPosition()).toLogical(scaleFactor);
    persister.schedule({
      width: Math.round(size.width),
      height: Math.round(size.height),
      x: Math.round(position.x),
      y: Math.round(position.y),
    });
  };

  const unlistenResized = await appWindow.onResized(() => void capture());
  const unlistenMoved = await appWindow.onMoved(() => void capture());

  return () => {
    unlistenResized();
    unlistenMoved();
    persister.flush();
  };
}
