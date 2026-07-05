import { useCallback, useMemo } from "react";
import { useDocuments } from "../documents/react";
import type { RegistryEntry } from "../documents/service";

/**
 * A round *is* a flow-sheet document.
 *
 * The round lifecycle rides entirely on the existing document layer: every round
 * is one `flow-sheet` document, so a round's stable id is exactly that
 * document's id (the suffix of its `fulcrum:doc:<id>` content database). Opening
 * a round means opening that document; the round's columns are the flow-sheet
 * model stored on it. Because each document lives in its own IndexedDB database,
 * two rounds are isolated by construction - an edit to one round's flow sheet
 * can never surface in another.
 *
 * There is deliberately no separate "round" registry or metadata store: the
 * document registry already indexes every document by kind, so filtering to
 * `flow-sheet` yields the rounds, recency-ordered, for free.
 */
export const ROUND_KIND = "flow-sheet" as const;

/** A round as surfaced to the app shell - a thin view over its registry entry. */
export interface Round {
  /** Stable id; identical to the backing flow-sheet document's id. */
  id: string;
  /** Human-facing title. */
  title: string;
  /** Creation time, epoch ms. */
  createdAt: number;
  /** Last-edited time, epoch ms. Drives recency ordering. */
  lastEditedAt: number;
}

/** Default title for a freshly created round when the caller supplies none. */
export function defaultRoundTitle(existingCount: number): string {
  return `Round ${existingCount + 1}`;
}

function toRound(entry: RegistryEntry): Round {
  return {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    lastEditedAt: entry.lastEditedAt,
  };
}

/** What {@link useRounds} returns. */
export interface UseRoundsResult {
  /** All rounds, most-recently-edited first. Empty until the local load resolves. */
  rounds: Round[];
  /** `true` until the first listing has been read from the local store. */
  loading: boolean;
  /**
   * Creates a fresh round (an empty flow-sheet document) and returns its id, so
   * the caller can navigate straight to it. The new round's flow sheet starts
   * with no columns.
   */
  createRound: (title?: string) => Promise<string>;
  /** Deletes a round and its flow-sheet content. */
  removeRound: (id: string) => Promise<void>;
}

/**
 * The live list of rounds plus the create/remove mutations, layered directly on
 * {@link useDocuments} - rounds are just the `flow-sheet` documents. This adds no
 * new infrastructure: it filters the document listing to the round kind and
 * routes creation/removal through the existing document service, so a round maps
 * stably to its flow sheet with no separate bookkeeping.
 */
export function useRounds(): UseRoundsResult {
  const { documents, loading, create, remove } = useDocuments();

  const rounds = useMemo(
    () => documents.filter((entry) => entry.kind === ROUND_KIND).map(toRound),
    [documents],
  );

  const createRound = useCallback(
    async (title?: string) => {
      const trimmed = title?.trim();
      const handle = await create({
        kind: ROUND_KIND,
        title: trimmed && trimmed.length > 0 ? trimmed : defaultRoundTitle(rounds.length),
      });
      return handle.id;
    },
    [create, rounds.length],
  );

  const removeRound = useCallback((id: string) => remove(id), [remove]);

  return { rounds, loading, createRound, removeRound };
}
