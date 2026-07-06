/**
 * The **scope gate** for the Shorthand Engine (slice 2/2): a pure, surface-generic
 * rule for whether abbreviation expansion should run on a given editor surface.
 *
 * A debater configures *where* shorthand expands - on the flow sheet, in a speech
 * document, both, or nowhere - and each surface consults this gate before invoking
 * the engine on its transition event. Keeping the decision here (pure, over a scope
 * value plus a surface identity) rather than inside the engine means a new surface
 * adopts scope gating by passing **its own** {@link ShorthandSurface} key - no
 * engine change, no per-surface branching. The flow surface ships in this slice; a
 * speech-doc surface later passes `"speech"` to the same function.
 */

/**
 * The user's configured expansion scope, persisted on the preference store (see
 * {@link ./preferences}). `"both"` is the natural default (a debater who enables
 * shorthand generally wants it everywhere they flow), `"neither"` turns it off
 * entirely, and the two surface-named values restrict it to one surface.
 */
export type ShorthandScope = "both" | "flow" | "speech" | "neither";

/**
 * A surface that can host shorthand expansion. Surface-generic by intent: a new
 * text surface adds its identity here (and, if it wants to be independently
 * gatable, a matching {@link ShorthandScope} value) and then calls
 * {@link isShorthandEnabledForSurface} with its key - the gate needs no other
 * change.
 */
export type ShorthandSurface = "flow" | "speech";

/**
 * Every {@link ShorthandScope} value, in a stable order for a settings control.
 * `"both"` first so it reads as the recommended default.
 */
export const SHORTHAND_SCOPES: readonly ShorthandScope[] = [
  "both",
  "flow",
  "speech",
  "neither",
];

/**
 * The default scope: expansion runs on every surface unless the debater narrows
 * it. See {@link ShorthandScope}.
 */
export const DEFAULT_SHORTHAND_SCOPE: ShorthandScope = "both";

/**
 * Whether shorthand expansion is enabled for `surface` under `scope` - the whole
 * gate, pure and total. `"both"` enables every surface, `"neither"` disables every
 * surface, and a surface-named scope enables only the matching surface. Because the
 * only surface-specific input is the passed key, a new surface is gated correctly
 * the moment it calls this with its own identity.
 */
export function isShorthandEnabledForSurface(
  scope: ShorthandScope,
  surface: ShorthandSurface,
): boolean {
  switch (scope) {
    case "both":
      return true;
    case "neither":
      return false;
    default:
      return scope === surface;
  }
}
