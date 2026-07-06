import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The live state + controls of a single countdown. `seconds` is the remaining
 * whole-second count; the timer decrements it once per second while `running`
 * and never falls below 0 (it auto-pauses on reaching the floor).
 */
export interface Countdown {
  /** Remaining whole seconds. */
  seconds: number;
  /** Whether the countdown is ticking. */
  running: boolean;
  /** Begin (or resume) ticking. No-op once already at 0. */
  start(): void;
  /** Stop ticking, keeping the current remaining time. */
  pause(): void;
  /** Flip between running and paused (the play/pause control). */
  toggle(): void;
  /** Stop and restore the initial default time. */
  reset(): void;
  /** Directly set the remaining time - the click-to-edit commit path. */
  setSeconds(seconds: number): void;
}

/**
 * A self-contained one-second countdown, the shared engine behind every timer
 * in the widget. Reset restores `initialSeconds` (a prep timer's 3:00 default);
 * an edit via {@link Countdown.setSeconds} changes the live remaining time
 * without disturbing that reset baseline. State is component/session state only
 * - nothing is persisted, matching the PRD's out-of-scope note.
 *
 * The tick runs off a single `setInterval` that exists only while running, so a
 * paused timer holds no timer resource, and the countdown clamps at 0 (pausing
 * itself there) rather than counting negative.
 */
export function useCountdown(initialSeconds: number): Countdown {
  const [seconds, setSecondsState] = useState(initialSeconds);
  const [running, setRunning] = useState(false);
  // The value `reset` returns to. Captured once so a live edit never changes it.
  const initialRef = useRef(initialSeconds);
  // Latest seconds, so start/toggle can guard against a spent clock without
  // nesting a setter inside another setter's updater (React StrictMode
  // double-invokes updaters in dev, which would fire such a side effect twice).
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsState((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Reaching the floor stops the clock (so the interval clears and it never
  // ticks uselessly at 0), kept as a pure effect rather than a side effect
  // inside the tick updater.
  useEffect(() => {
    if (running && seconds === 0) setRunning(false);
  }, [running, seconds]);

  const start = useCallback(() => {
    // Starting a spent timer would immediately re-pause; ignore it so the play
    // control never flickers on a 0:00 clock.
    if (secondsRef.current > 0) setRunning(true);
  }, []);

  const pause = useCallback(() => setRunning(false), []);

  const toggle = useCallback(() => {
    setRunning((wasRunning) => (wasRunning ? false : secondsRef.current > 0));
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setSecondsState(initialRef.current);
  }, []);

  const setSeconds = useCallback((next: number) => {
    setSecondsState(Math.max(0, Math.floor(next)));
  }, []);

  return { seconds, running, start, pause, toggle, reset, setSeconds };
}
