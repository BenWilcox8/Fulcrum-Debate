/**
 * The round lifecycle seam for the app shell.
 *
 * A round is a `flow-sheet` document (see {@link ./rounds}); this module maps the
 * round concept onto the existing document layer without adding new
 * infrastructure. The shell consumes {@link useRounds} to list/create/remove
 * rounds and opens a round's flow sheet through the document service by its id.
 */
export {
  ROUND_KIND,
  defaultRoundTitle,
  useRounds,
  type Round,
  type UseRoundsResult,
} from "./rounds";
