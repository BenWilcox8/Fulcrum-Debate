/**
 * Deterministic seed data for the PUBLIC-FORUM variant of the round-driver
 * harness (v1-speech-order tester).
 *
 * This variant deliberately differs *structurally* from the standard Policy/LD
 * harness round (`seed.ts`):
 *  - The round is flowed NEG-FIRST: the first speech column, and the first side
 *    a debater flows, is the negative (Con) team - the opposite of the standard
 *    harness, which opens on the 1AC.
 *  - The column labels are Public-Forum speech names (`Con Case`, `Pro Case`,
 *    `Con Rebuttal`, ...), NOT the `1AC`/`1NC` Policy labels - so the run
 *    stresses whether column headers, the timer speech selector, and speech-doc
 *    naming handle a non-default round structure gracefully.
 *  - Six speeches (constructive → rebuttal → summary/final-focus) instead of the
 *    standard five.
 *
 * Every string is fixed, so two consecutive runs flow the identical debate and
 * produce the identical ordered screenshot sequence.
 *
 * The shorthand abbreviations used (`neg`, `aff`, `fw`, `ext`, `impx`) are the
 * defaults the app seeds into its dictionary on boot (`DEFAULT_SHORTHAND_ENTRIES`),
 * so the expansion step needs no extra seeding.
 */

import type { SpeechSeed } from "./seed";

/** The round's resolution - shown in the RFD and used as flavour. */
export const RESOLUTION =
  "Resolved: The benefits of the European Union outweigh the costs for its member states.";

/**
 * The full round: six Public-Forum speeches, flowed NEG-FIRST (Con opens). Each
 * is flowed live through the C#/S# triggers and the Enter / Shift+Enter
 * argument-row transitions. One row intentionally exercises a shorthand
 * abbreviation so the expansion is visible on the completed row.
 */
export const SPEECHES: readonly SpeechSeed[] = [
  {
    label: "Con Case",
    side: "neg",
    slug: "con-case",
    contentions: [
      {
        rows: [
          {
            lead: "Sovereignty cost: EU rules override national parliaments.",
            responses: [
              "Directives bind members even where domestic voters object.",
              "The democratic deficit erodes trust in national institutions.",
            ],
            subpoints: [
              "Qualified-majority voting lets large blocs outvote small states.",
            ],
          },
          {
            lead: "Fiscal drag: net contributors subsidise the whole union.",
            responses: ["Structural transfers persist long after convergence stalls."],
          },
        ],
      },
      {
        rows: [
          {
            lead: "Regulatory burden: one-size rules ignore local economies.",
            responses: [
              "Compliance costs fall hardest on small and rural firms.",
              "Harmonisation crowds out national policy experiments.",
            ],
          },
        ],
      },
    ],
  },
  {
    label: "Pro Case",
    side: "aff",
    slug: "pro-case",
    contentions: [
      {
        rows: [
          {
            lead: "Single market: frictionless trade lifts every member economy.",
            responses: [
              "Tariff-free access is the largest integrated market on earth.",
              "Cross-border supply chains cut costs for consumers directly.",
            ],
          },
          {
            lead: "Turn: shared standards impx lower barriers, not raise them.",
            responses: ["Mutual recognition replaces twenty-seven separate regimes."],
          },
        ],
      },
    ],
  },
  {
    label: "Con Rebuttal",
    side: "neg",
    slug: "con-rebuttal",
    contentions: [
      {
        rows: [
          {
            lead: "neg controls the sovereignty internal link the Pro never answers",
            responses: ["Dropped democratic-deficit offense flows neg and is conceded."],
          },
          {
            lead: "The single-market benefit is non-unique: trade deals do that too.",
            responses: ["Bilateral agreements capture most gains without the political cost."],
          },
        ],
      },
    ],
  },
  {
    label: "Pro Rebuttal",
    side: "aff",
    slug: "pro-rebuttal",
    contentions: [
      {
        rows: [
          {
            lead: "Extend the single-market offense - it is conceded and terminal.",
            responses: [
              "The Con never contests that market access is net-positive.",
              "Prefer measured prosperity over speculative sovereignty harms.",
            ],
          },
        ],
      },
    ],
  },
  {
    label: "Con Summary",
    side: "neg",
    slug: "con-summary",
    contentions: [
      {
        rows: [
          {
            lead: "Collapse to the sovereignty fw - it is the cleanest ballot.",
            responses: ["Prefer accountable national democracy over aggregate GDP."],
          },
        ],
      },
    ],
  },
  {
    label: "Pro FF",
    side: "aff",
    slug: "pro-ff",
    contentions: [
      {
        rows: [
          {
            lead: "ext the market offense straight into the ballot.",
            responses: ["Conceded prosperity gains are a terminal impact the Con never answers."],
          },
        ],
      },
    ],
  },
];

/** Deterministic prep-timer value the harness edits the neg (Con) clock to. */
export const PREP_TIME = "1:30";

/** The Reason For Decision written at the end of the round. */
export const RFD_TEXT =
  "Con wins. The Con Case sovereignty contention is conceded by the Pro Rebuttal, and dropped democratic-deficit offense is a clean terminal impact. The single-market benefit is non-unique - bilateral trade captures the gains without the political cost. Voting Con on conceded sovereignty.";

/** A card seeded into the block file (tag / tagline / cite / body). */
export const BLOCK_CARD = {
  tag: "Sovereignty outweighs",
  tagline: "EU rule-making hollows out national democratic accountability",
  cite: "Institute for Government 2023",
  body: "Qualified-majority voting and binding directives let supranational bodies override the express preferences of national parliaments, deepening a democratic deficit that erodes public trust in domestic institutions.",
} as const;
