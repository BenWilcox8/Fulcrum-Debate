/**
 * Deterministic seed data for the round-driver harness.
 *
 * Every string here is fixed, so two consecutive runs flow the *identical*
 * debate and produce the identical state sequence. This is realistic debate
 * content (a real resolution, contentions, responses, an RFD) - never lorem
 * ipsum - because the screenshots are the product and an auditor reads them as
 * a real round.
 *
 * The shorthand abbreviations used (`aff`, `neg`, `fw`, `ext`, `impx`) are the
 * defaults the app seeds into its dictionary on boot
 * (`DEFAULT_SHORTHAND_ENTRIES`), so the expansion step needs no extra seeding.
 */

/** The round's resolution - shown in the RFD and used as flavour. */
export const RESOLUTION =
  "Resolved: The United States federal government should substantially increase its investment in high-speed rail.";

/** One flowed argument row: the first line, then follow-on grouped responses. */
export interface ArgumentSeed {
  /** The opening line of the argument row (Enter starts the next row). */
  readonly lead: string;
  /** Grouped responses under the same row (each added with Shift+Enter). */
  readonly responses: readonly string[];
  /** Optional nested subpoints (dropped with the S# trigger). */
  readonly subpoints?: readonly string[];
}

/** One contention dropped into a column via the C# trigger. */
export interface ContentionSeed {
  readonly rows: readonly ArgumentSeed[];
}

/** One speech = one flow column plus the contentions flowed into it. */
export interface SpeechSeed {
  /** Column label, e.g. "1AC". */
  readonly label: string;
  /** Debate side - drives the column colour. */
  readonly side: "aff" | "neg";
  /** Human name of the speech, used in screenshot slugs. */
  readonly slug: string;
  /** Contentions flowed into this column, in order. */
  readonly contentions: readonly ContentionSeed[];
}

/**
 * The full round: five speeches, aff and neg alternating, each flowed live
 * through the C#/S# triggers and Enter / Shift+Enter argument-row transitions.
 * One row per speech intentionally exercises a shorthand abbreviation so the
 * expansion is visible on the completed row.
 */
export const SPEECHES: readonly SpeechSeed[] = [
  {
    label: "1AC",
    side: "aff",
    slug: "1ac",
    contentions: [
      {
        rows: [
          {
            lead: "Economic competitiveness: rail cuts freight costs nationwide.",
            responses: [
              "High-speed corridors move goods faster than congested highways.",
              "The Chamber of Commerce projects a 12 percent logistics saving.",
            ],
            subpoints: [
              "Manufacturing hubs gain reliable just-in-time delivery.",
            ],
          },
          {
            lead: "The aff solvency mechanism funds dedicated track first.",
            responses: ["Dedicated track avoids the delays that sank prior projects."],
          },
        ],
      },
      {
        rows: [
          {
            lead: "Climate: electrified rail displaces short-haul aviation.",
            responses: [
              "Aviation is the fastest-growing source of transport emissions.",
              "Rail on a clean grid is an order of magnitude cleaner per passenger-mile.",
            ],
          },
        ],
      },
    ],
  },
  {
    label: "1NC",
    side: "neg",
    slug: "1nc",
    contentions: [
      {
        rows: [
          {
            lead: "Framework: evaluate the neg on fiscal tradeoff first.",
            responses: [
              "Every dollar to rail is a dollar not spent on proven transit.",
              "Opportunity cost outweighs the aff's speculative gains.",
            ],
          },
          {
            lead: "Turn: construction impx spikes near-term emissions.",
            responses: ["Concrete and steel for track are carbon-intensive up front."],
          },
        ],
      },
    ],
  },
  {
    label: "1AR",
    side: "aff",
    slug: "1ar",
    contentions: [
      {
        rows: [
          {
            lead: "aff case controls the internal link to every impact",
            responses: ["Dropped offense flows aff and is conceded true."],
          },
          {
            lead: "The construction turn is non-unique: highways emit that too.",
            responses: ["Lifecycle emissions favour rail within eight years."],
          },
        ],
      },
    ],
  },
  {
    label: "2NR",
    side: "neg",
    slug: "2nr",
    contentions: [
      {
        rows: [
          {
            lead: "Collapse to the fiscal-tradeoff fw - it is the cleanest ballot.",
            responses: [
              "The aff never contests that transit funding is zero-sum.",
              "Prefer near-term certainty over long-horizon speculation.",
            ],
          },
        ],
      },
    ],
  },
  {
    label: "2AR",
    side: "aff",
    slug: "2ar",
    contentions: [
      {
        rows: [
          {
            lead: "Ext the competitiveness offense straight into the ballot.",
            responses: ["Conceded freight savings are a terminal impact the neg never answers."],
          },
        ],
      },
    ],
  },
];

/** Deterministic prep-timer value the harness edits the aff clock to. */
export const PREP_TIME = "2:30";

/** The Reason For Decision written at the end of the round. */
export const RFD_TEXT =
  "Aff wins. The 1AC competitiveness contention is conceded by the 2NR, and dropped freight-cost offense is a clean terminal impact. The fiscal-tradeoff framework never answers that rail savings are themselves fiscal. Voting aff on conceded competitiveness.";

/** A card seeded into the block file (tag / tagline / cite / body). */
export const BLOCK_CARD = {
  tag: "Rail solves freight",
  tagline: "High-speed rail slashes national logistics costs",
  cite: "Chamber of Commerce 2024",
  body: "Dedicated high-speed corridors cut freight transit times and deliver a projected twelve percent logistics saving across the manufacturing sector.",
} as const;
