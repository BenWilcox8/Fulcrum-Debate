/**
 * The floating flow-sheet timer widget: two side prep timers and a dynamic
 * speech timer, overlaid on the flow without blocking flow interactions. The
 * countdowns are component/session state; only the card's drag position persists
 * (per-machine view chrome, like the dock layout).
 */
export { TimerWidget, type TimerWidgetProps } from "./TimerWidget";
export {
  DEFAULT_TIMER_POSITION,
  clampTimerPosition,
  normalizeTimerPosition,
  timerPositionFromPointer,
  timerOffsetPx,
  type TimerPosition,
} from "./timer-position";
export {
  TIMER_POSITION_STORAGE_KEY,
  readTimerPosition,
  writeTimerPosition,
  type TimerPositionStorage,
} from "./timer-position-storage";
export { useTimerPosition, type UseTimerPositionResult } from "./useTimerPosition";
export { PrepTimer, type PrepTimerProps, type TimerSide } from "./PrepTimer";
export {
  SpeechTimer,
  SPEECH_OPTIONS,
  type SpeechLabel,
  type SpeechTimerProps,
} from "./SpeechTimer";
export { EditableTime, type EditableTimeProps } from "./EditableTime";
export { useCountdown, type Countdown } from "./useCountdown";
export {
  formatTime,
  parseTime,
  DEFAULT_PREP_SECONDS,
  DEFAULT_SPEECH_SECONDS,
} from "./countdown";
