/**
 * The reactive rendering layer for the evidence formatting profile (slice 2 of
 * the Evidence Formatting feature).
 *
 * - {@link useFormattingProfile} reads the live merged {@link FormattingProfile}
 *   off the shared preference store and re-renders on any edit (provider-tolerant,
 *   falling back to the standard on a bare tree).
 * - {@link CardFormattingStyles} emits that profile as scoped CSS into a
 *   `<style>` element, so card regions and highlighted runs render to the house
 *   standard and update live when the profile changes.
 *
 * This layer is kept separate from the pure `src/formatting` model/CSS index so
 * the model stays free of React. Import it directly from `src/formatting/react`.
 */
export { useFormattingProfile } from "./useFormattingProfile";
export {
  CardFormattingStyles,
  type CardFormattingStylesProps,
} from "./CardFormattingStyles";
