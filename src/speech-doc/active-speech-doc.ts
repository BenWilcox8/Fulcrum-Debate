/**
 * The **active speech doc** contract - the key shared surface of the whole
 * speech-doc track.
 *
 * A debater keeps many speech docs open over a round, but the content pipelines
 * (Send Flow, the ToC "build a speech" flow, drag-a-card-to-speech - each its
 * own later PRD) all need one unambiguous target: *the active speech doc*, the
 * one the debater is currently building into. This module is the model-level
 * seam that names which speech doc that is and lets any feature query or set it,
 * decoupled from routing, the editor, and the (later) split-screen docking UI.
 *
 * ## The contract
 *
 * The active speech doc is identified by a **document id** (exactly the id
 * {@link ../documents | the document service} opens - the same id a speech doc
 * is created/listed under via {@link ./speech-doc}). `null` means no speech doc
 * is active yet. A pipeline resolves the active target by reading
 * {@link ActiveSpeechDocStore.getActiveId} and then opening that document
 * through the shared service; it never needs to know how the id was chosen.
 *
 * Kept **React-free** on purpose: the store is the model, so a non-React pipeline
 * (or a test) can hold one directly. The React distribution layer - a provider
 * that owns one app-lifetime store, and hooks that read it reactively - lives in
 * {@link ./active-speech-doc-context} and {@link ./ActiveSpeechDocProvider}.
 *
 * This is deliberately *transient session state*, not persisted document
 * content: "which speech doc am I building into right now" is a moment-to-moment
 * pointer, not a property of any document worth surviving a reload. Keeping it
 * out of the shared Yjs types means it never syncs or conflicts.
 */

/**
 * The model-level pointer to the active speech doc: which document id is the
 * current target for content pipelines, with a subscribe seam so React (or any
 * consumer) can react to it changing.
 */
export interface ActiveSpeechDocStore {
  /** The active speech doc's document id, or `null` when none is active. */
  getActiveId(): string | null;
  /**
   * Sets (or clears, with `null`) the active speech doc id. A no-op when the id
   * is unchanged, so the snapshot reference stays stable and subscribers only
   * fire on a real change.
   */
  setActiveId(id: string | null): void;
  /**
   * Subscribes to active-id changes. Fires after each real change; returns an
   * unsubscribe. It does **not** fire immediately on subscribe (read the current
   * value via {@link getActiveId}), so it composes with `useSyncExternalStore`.
   */
  subscribe(listener: () => void): () => void;
}

/**
 * Creates a fresh {@link ActiveSpeechDocStore}. Each store is independent
 * in-memory state - the app owns one shared instance (via the provider), while
 * tests can spin up isolated ones.
 */
export function createActiveSpeechDocStore(): ActiveSpeechDocStore {
  let activeId: string | null = null;
  const listeners = new Set<() => void>();

  return {
    getActiveId: () => activeId,
    setActiveId(id) {
      if (id === activeId) return;
      activeId = id;
      // Snapshot the listeners so an unsubscribe during notification is safe.
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
