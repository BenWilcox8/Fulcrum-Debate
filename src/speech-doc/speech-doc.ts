import { useCallback, useMemo } from "react";
import { useDocuments } from "../documents/react";
import type { RegistryEntry } from "../documents/service";

/**
 * A speech doc *is* a `speech-doc` document.
 *
 * The speech-doc lifecycle rides entirely on the existing document layer, the
 * same way a round rides the `flow-sheet` kind (see {@link ../rounds/rounds}):
 * every speech doc is one `speech-doc` {@link ../documents | document}, so a
 * speech doc's stable id is exactly that document's id. Opening a speech doc
 * means opening that document; its rich text lives in the document's
 * {@link SPEECH_DOC_BODY_FRAGMENT} fragment. Because each document lives in its
 * own IndexedDB database, two speech docs are isolated by construction.
 *
 * Unlike the block file (a workspace singleton), a debater keeps *many* speech
 * docs - one per speech they draft or read - so this seam mirrors the round
 * seam's list/create/remove shape rather than the singleton find-or-create.
 * There is deliberately no separate "speech-doc" registry: the document registry
 * already indexes every document by kind, so filtering to `speech-doc` yields the
 * speech docs, recency-ordered, for free.
 *
 * ## Fragment convention
 *
 * Per the document-model contract (see AGENTS.md "Fragment convention"), a
 * kind's content lives under named top-level shared types ("fragments") on the
 * document's `Y.Doc`. A speech doc has one fixed content fragment:
 *
 * | Fragment | Yjs type | Meaning |
 * |---|---|---|
 * | `body` | `Y.XmlFragment` | The speech's rich text (drafted / read-aloud). |
 *
 * It is a `Y.XmlFragment` because it is edited through the shared Tiptap editor
 * ({@link ../editor/react/DocumentEditor | DocumentEditor}), so it persists and
 * reloads through the identical Yjs + y-indexeddb path as every other text
 * surface in the app - no bespoke storage. Yjs binds `body` to `Y.XmlFragment`
 * for the life of the document; per the one-fragment-name-binds-to-one-type
 * rule it must never be re-typed or renamed.
 */
export const SPEECH_DOC_KIND = "speech-doc" as const;

/**
 * The fixed top-level `Y.XmlFragment` name holding a speech doc's rich text on
 * its `Y.Doc`. A single fragment per document (one body per speech), so - like
 * the RFD and block-file bodies - it is a bare constant, not an id-keyed name
 * builder.
 */
export const SPEECH_DOC_BODY_FRAGMENT = "body";

/** A speech doc as surfaced to the app shell - a thin view over its registry entry. */
export interface SpeechDoc {
  /** Stable id; identical to the backing `speech-doc` document's id. */
  id: string;
  /** Human-facing title. */
  title: string;
  /** Creation time, epoch ms. */
  createdAt: number;
  /** Last-edited time, epoch ms. Drives recency ordering. */
  lastEditedAt: number;
}

/** Default title for a freshly created speech doc when the caller supplies none. */
export function defaultSpeechDocTitle(existingCount: number): string {
  return `Speech ${existingCount + 1}`;
}

function toSpeechDoc(entry: RegistryEntry): SpeechDoc {
  return {
    id: entry.id,
    title: entry.title,
    createdAt: entry.createdAt,
    lastEditedAt: entry.lastEditedAt,
  };
}

/** What {@link useSpeechDocs} returns. */
export interface UseSpeechDocsResult {
  /** All speech docs, most-recently-edited first. Empty until the local load resolves. */
  speechDocs: SpeechDoc[];
  /** `true` until the first listing has been read from the local store. */
  loading: boolean;
  /**
   * Creates a fresh speech doc (an empty `speech-doc` document) and returns its
   * id, so the caller can navigate straight to it. The new speech doc starts
   * with an empty body.
   */
  createSpeechDoc: (title?: string) => Promise<string>;
  /** Deletes a speech doc and its content. */
  removeSpeechDoc: (id: string) => Promise<void>;
}

/**
 * The live list of speech docs plus the create/remove mutations, layered
 * directly on {@link useDocuments} - speech docs are just the `speech-doc`
 * documents. This adds no new infrastructure: it filters the document listing to
 * the speech-doc kind and routes creation/removal through the existing document
 * service, so a speech doc maps stably to its content with no separate
 * bookkeeping.
 */
export function useSpeechDocs(): UseSpeechDocsResult {
  const { documents, loading, create, remove } = useDocuments();

  const speechDocs = useMemo(
    () =>
      documents
        .filter((entry) => entry.kind === SPEECH_DOC_KIND)
        .map(toSpeechDoc),
    [documents],
  );

  const createSpeechDoc = useCallback(
    async (title?: string) => {
      const trimmed = title?.trim();
      const handle = await create({
        kind: SPEECH_DOC_KIND,
        title:
          trimmed && trimmed.length > 0
            ? trimmed
            : defaultSpeechDocTitle(speechDocs.length),
      });
      return handle.id;
    },
    [create, speechDocs.length],
  );

  const removeSpeechDoc = useCallback((id: string) => remove(id), [remove]);

  return { speechDocs, loading, createSpeechDoc, removeSpeechDoc };
}
