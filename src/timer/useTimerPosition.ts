import { useCallback, useState } from "react";

import { clampTimerPosition, type TimerPosition } from "./timer-position";
import {
  readTimerPosition,
  writeTimerPosition,
  type TimerPositionStorage,
} from "./timer-position-storage";

/** What {@link useTimerPosition} returns. */
export interface UseTimerPositionResult {
  /** The live timer position (fractional, `[0, 1]` per axis). */
  position: TimerPosition;
  /** Sets the position (clamped); persisted immediately. */
  setPosition: (position: TimerPosition) => void;
}

/**
 * Reactive access to the persisted {@link TimerPosition}, seeded synchronously
 * from local storage so the first paint already reflects where the debater last
 * parked the timer (no flash of the default, no async gate - upholding
 * local-first boot). Every mutation writes straight back through
 * {@link ./timer-position-storage}, so the choice survives a reload.
 *
 * The initial read runs once in a lazy `useState` initializer. The `storage`
 * argument lets a test drive an isolated stub: omit it (or pass `undefined`) to
 * use the real `localStorage`; pass an explicit `null` to disable persistence
 * (pure in-memory behaviour).
 */
export function useTimerPosition(
  storage?: TimerPositionStorage | null,
): UseTimerPositionResult {
  const [position, setPositionState] = useState<TimerPosition>(() =>
    storage === undefined ? readTimerPosition() : readTimerPosition(storage),
  );

  const setPosition = useCallback(
    (next: TimerPosition) => {
      const clamped = clampTimerPosition(next);
      setPositionState(clamped);
      if (storage === undefined) writeTimerPosition(clamped);
      else if (storage !== null) writeTimerPosition(clamped, storage);
    },
    [storage],
  );

  return { position, setPosition };
}
