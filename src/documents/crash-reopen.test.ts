// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global - the same pattern the core, registry, and service tests use.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocumentService } from "./service";

/**
 * Highest-seam unclean-shutdown ("crash") integration test.
 *
 * These exercise the whole local document layer through its only public entry
 * point - the service - the way a feature would, and prove that a genuine crash
 * is recoverable: documents are created and edited through one service, then
 * that service and all its handles are *abandoned without ever calling close()*
 * (the unclean shutdown), and a completely fresh service is opened over the same
 * IndexedDB backend. The fresh service must see the latest content and the full,
 * correctly-ordered registry listing.
 *
 * This models a real force-quit: y-indexeddb writes each update to IndexedDB
 * promptly, so an edit that has reached the store survives even though no
 * teardown ran. We yield a macrotask ({@link flushToStore}) after editing to let
 * those writes commit - that flushed state is exactly what a crash would leave
 * on disk - then drop every reference without closing, simulating the crash.
 */

// A fresh IndexedDB backend per test. Crucially, we do NOT reset it inside a
// test: the recovery service must read the *same* backend the crashed one wrote.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Let y-indexeddb's queued update writes commit to the backing store. */
const flushToStore = () => new Promise((r) => setTimeout(r, 25));

/** A distinct clock tick so successive edits get strictly ordered timestamps. */
const tick = () => new Promise((r) => setTimeout(r, 5));

describe("crash then reopen a fresh service over the same store", () => {
  it("restores the latest content of every document, including an edit made just before the crash", async () => {
    // --- A session that will crash ---
    const crashed = openDocumentService();

    const flow = await crashed.create({ kind: "flow-sheet", title: "R1 vs Westside" });
    const speech = await crashed.create({ kind: "speech-doc", title: "1AC" });
    await flow.whenLoaded;
    await speech.whenLoaded;
    const flowId = flow.id;
    const speechId = speech.id;

    flow.doc.getText("body").insert(0, "aff contention one");
    flow.doc.getMap("meta").set("judge", "Ramirez");
    speech.doc.getText("body").insert(0, "We affirm.");

    // An edit made "shortly before the crash": appended last, must still survive.
    const speechBody = speech.doc.getText("body");
    speechBody.insert(speechBody.length, " Thus, we urge a ballot for the affirmative.");

    // Let those writes reach the store, then CRASH: abandon the service and both
    // handles with no close(). No teardown, no flush hook - just gone.
    await flushToStore();

    // --- A brand-new session over the same IndexedDB backend ---
    const recovered = openDocumentService();
    await recovered.whenReady;

    // The registry listing survived the crash intact.
    const listed = await recovered.list();
    expect(listed.map((e) => e.id).sort()).toEqual([flowId, speechId].sort());

    // The latest content of each document survived, edit-before-crash included.
    const recoveredFlow = await recovered.open(flowId);
    await recoveredFlow.whenLoaded;
    expect(recoveredFlow.doc.getText("body").toString()).toBe("aff contention one");
    expect(recoveredFlow.doc.getMap("meta").get("judge")).toBe("Ramirez");

    const recoveredSpeech = await recovered.open(speechId);
    await recoveredSpeech.whenLoaded;
    expect(recoveredSpeech.doc.getText("body").toString()).toBe(
      "We affirm. Thus, we urge a ballot for the affirmative.",
    );

    await recovered.close();
  });

  it("restores the registry listing with last-edited ordering intact", async () => {
    const crashed = openDocumentService();

    const first = await crashed.create({ kind: "flow-sheet", title: "First" });
    const second = await crashed.create({ kind: "speech-doc", title: "Second" });
    const third = await crashed.create({ kind: "block-file", title: "Third" });
    await Promise.all([first.whenLoaded, second.whenLoaded, third.whenLoaded]);

    // Edit them in a deliberate order with distinct clock ticks between edits so
    // last-edited strictly orders them. Edit order is third, then second, then
    // first, so recency descending is first > second > third. Edit-tracking
    // (registry.track) bumps each entry's lastEditedAt on these genuine edits.
    third.doc.getText("body").insert(0, "c");
    await tick();
    second.doc.getText("body").insert(0, "b");
    await tick();
    first.doc.getText("body").insert(0, "a");

    const expectedOrder = [first.id, second.id, third.id];

    // Flush the metadata + content writes, then crash without closing.
    await flushToStore();

    const recovered = openDocumentService();
    await recovered.whenReady;

    const listed = await recovered.list();
    // Recency ordering survived the unclean shutdown.
    expect(listed.map((e) => e.id)).toEqual(expectedOrder);
    // The full metadata for each entry survived too - kinds and titles intact.
    expect(listed.map((e) => ({ kind: e.kind, title: e.title }))).toEqual([
      { kind: "flow-sheet", title: "First" },
      { kind: "speech-doc", title: "Second" },
      { kind: "block-file", title: "Third" },
    ]);

    await recovered.close();
  });

  it("restores a rename made just before the crash, and its recency bump", async () => {
    const crashed = openDocumentService();
    const older = await crashed.create({ kind: "flow-sheet", title: "Older" });
    const newer = await crashed.create({ kind: "speech-doc", title: "Working title" });
    await Promise.all([older.whenLoaded, newer.whenLoaded]);

    // `newer` was created last, so it already leads the recency order. Rename
    // `older` last of all: a rename is a user-visible change that bumps
    // last-edited, so `older` must overtake `newer` after the crash.
    await tick();
    await crashed.rename(older.id, "Final title");

    await flushToStore();

    const recovered = openDocumentService();
    await recovered.whenReady;

    const listed = await recovered.list();
    expect(listed.map((e) => ({ id: e.id, title: e.title }))).toEqual([
      { id: older.id, title: "Final title" },
      { id: newer.id, title: "Working title" },
    ]);

    await recovered.close();
  });
});
