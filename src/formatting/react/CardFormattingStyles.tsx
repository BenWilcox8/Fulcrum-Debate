import { useMemo } from "react";

import { formattingProfileCss, type FormattingCssOptions } from "../css";
import { useFormattingProfile } from "./useFormattingProfile";

/** Props for {@link CardFormattingStyles}. */
export interface CardFormattingStylesProps {
  /**
   * The container selector the emitted rules are scoped under. Defaults to the
   * block file's editor surface class (see
   * {@link ../css.DEFAULT_FORMATTING_SCOPE}). Pass another surface's class to
   * apply the standard there.
   */
  scope?: FormattingCssOptions["scope"];
}

/**
 * Mounts the live evidence-formatting stylesheet: it reads the merged formatting
 * profile off the shared preference store and renders it as scoped CSS in a
 * `<style>` element, so every card region and highlighted run renders to the
 * house standard.
 *
 * Because it reads through {@link useFormattingProfile}, editing any formatting
 * target re-renders this component and rewrites the `<style>` in place - card
 * rendering updates live, with no reload. With no preference-store provider it
 * still emits the standard profile (the hook degrades gracefully), so a card
 * always renders correctly.
 *
 * Render it once anywhere inside the editor screen's subtree (a `<style>` is
 * valid in flow content); the scoped rules find the card hooks wherever they are.
 */
export function CardFormattingStyles({ scope }: CardFormattingStylesProps = {}) {
  const profile = useFormattingProfile();
  const css = useMemo(
    () => formattingProfileCss(profile, { scope }),
    [profile, scope],
  );
  return <style data-card-formatting="">{css}</style>;
}
