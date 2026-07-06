/**
 * The floating flow-sheet timer widget: two side prep timers and a dynamic
 * speech timer, overlaid on the flow without blocking flow interactions. All
 * state is component/session state - nothing is persisted.
 */
export { TimerWidget } from "./TimerWidget";
export { PrepTimer, type PrepTimerProps, type TimerSide } from "./PrepTimer";
export { SpeechTimer, SPEECH_OPTIONS, type SpeechLabel } from "./SpeechTimer";
export { EditableTime, type EditableTimeProps } from "./EditableTime";
export { useCountdown, type Countdown } from "./useCountdown";
export {
  formatTime,
  parseTime,
  DEFAULT_PREP_SECONDS,
  DEFAULT_SPEECH_SECONDS,
} from "./countdown";
