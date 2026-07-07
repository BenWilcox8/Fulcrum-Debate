// jsdom has no IndexedDB; the flow and document layers read the global, so
// install the in-memory fake before anything touches it (the document-layer test
// pattern). These tests drive the **Send Flow -> Speech Doc** append over *real*
// flow-sheet and speech-doc handles: a multi-selection of flow containers has its
// prose appended to the active speech doc's body, the flow is left completely
// untouched, and the appended content survives a genuine speech-doc close/reopen.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { describe, it, expect, beforeEach } from "vitest";

import { openDocument, type DocumentHandle } from "../documents/core";
import { addColumn } from "./columns";
import { addContention, contentionContentFragment } from "./contention";
import { addSubpoint, subpointContentFragment } from "./subpoint";
import { SPEECH_DOC_BODY_FRAGMENT } from "../speech-doc/speech-doc";
import { appendFlowNodesToSpeechDoc } from "./send-to-speech";

// A fresh IndexedDB backend per test so persisted documents never leak.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

let nextId = 0;
const uniqueId = () => `send-${Date.now()}-${nextId++}`;

const openFlowSheet = async (id = uniqueId()): Promise<DocumentHandle> => {
  const handle = openDocument({ id, kind: "flow-sheet" });
  await handle.whenLoaded;
  return handle;
};

const openSpeechDoc = async (id = uniqueId()): Promise<DocumentHandle> => {
  const handle = openDocument({ id, kind: "speech-doc" });
  await handle.whenLoaded;
  return handle;
};

/**
 * Writes an `<argument><response><paragraph>...</paragraph></response></argument>`
 * shape into a flow-box content fragment - the addressable argument-row structure
 * the shared Tiptap surface persists. Each entry may carry a `bold` mark so mark
 * preservation is checkable. Multiple paragraphs land in one response.
 */
const writeArgument = (
  handle: DocumentHandle,
  fragmentName: string,
  paragraphs: Array<{ text: string; bold?: boolean }>,
): void => {
  const fragment = handle.doc.getXmlFragment(fragmentName);
  handle.doc.transact(() => {
    const paragraphEls = paragraphs.map(({ text, bold }) => {
      const paragraph = new Y.XmlElement("paragraph");
      const textNode = new Y.XmlText();
      if (text.length > 0) {
        textNode.applyDelta([
          bold ? { insert: text, attributes: { bold: {} } } : { insert: text },
        ]);
      }
      paragraph.insert(0, [textNode]);
      return paragraph;
    });
    const response = new Y.XmlElement("response");
    response.insert(0, paragraphEls);
    const argument = new Y.XmlElement("argument");
    argument.insert(0, [response]);
    fragment.insert(fragment.length, [argument]);
  });
};

/** The flattened text of every top-level `<paragraph>` in a body fragment. */
const bodyParagraphTexts = (handle: DocumentHandle): string[] =>
  handle.doc
    .getXmlFragment(SPEECH_DOC_BODY_FRAGMENT)
    .toArray()
    .filter((n): n is Y.XmlElement => n instanceof Y.XmlElement)
    .map((p) => p.toString().replace(/<[^>]*>/g, ""));

describe("appendFlowNodesToSpeechDoc", () => {
  it("appends the selected containers' paragraphs to the speech doc body, in flow order", async () => {
    const flow = await openFlowSheet();
    const speech = await openSpeechDoc();
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    const c2 = addContention(flow, column.id);
    writeArgument(flow, contentionContentFragment(c1.id), [
      { text: "Warming is real" },
    ]);
    writeArgument(flow, contentionContentFragment(c2.id), [
      { text: "Extinction outweighs" },
    ]);

    const result = appendFlowNodesToSpeechDoc(flow, speech, [c2.id, c1.id]);

    expect(result).toEqual({ nodeCount: 2, paragraphCount: 2 });
    // Flow reading order (c1 then c2), regardless of selection order.
    expect(bodyParagraphTexts(speech)).toEqual([
      "Warming is real",
      "Extinction outweighs",
    ]);

    await flow.close();
    await speech.close();
  });

  it("only appends selected containers, leaving unselected ones out", async () => {
    const flow = await openFlowSheet();
    const speech = await openSpeechDoc();
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    const c2 = addContention(flow, column.id);
    writeArgument(flow, contentionContentFragment(c1.id), [{ text: "Picked" }]);
    writeArgument(flow, contentionContentFragment(c2.id), [
      { text: "Not picked" },
    ]);

    appendFlowNodesToSpeechDoc(flow, speech, [c1.id]);

    expect(bodyParagraphTexts(speech)).toEqual(["Picked"]);

    await flow.close();
    await speech.close();
  });

  it("includes selected subpoints, nested-order after their contention", async () => {
    const flow = await openFlowSheet();
    const speech = await openSpeechDoc();
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    const s1 = addSubpoint(flow, c1.id);
    writeArgument(flow, contentionContentFragment(c1.id), [{ text: "Claim" }]);
    writeArgument(flow, subpointContentFragment(s1.id), [{ text: "Warrant" }]);

    appendFlowNodesToSpeechDoc(flow, speech, [s1.id, c1.id]);

    expect(bodyParagraphTexts(speech)).toEqual(["Claim", "Warrant"]);

    await flow.close();
    await speech.close();
  });

  it("preserves inline marks on the appended paragraphs", async () => {
    const flow = await openFlowSheet();
    const speech = await openSpeechDoc();
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    writeArgument(flow, contentionContentFragment(c1.id), [
      { text: "Bold tagline", bold: true },
    ]);

    appendFlowNodesToSpeechDoc(flow, speech, [c1.id]);

    const paragraph = speech.doc
      .getXmlFragment(SPEECH_DOC_BODY_FRAGMENT)
      .toArray()[0] as Y.XmlElement;
    const text = paragraph.toArray()[0] as Y.XmlText;
    const delta = text.toDelta() as Array<{
      insert: string;
      attributes?: Record<string, unknown>;
    }>;
    expect(delta[0].insert).toBe("Bold tagline");
    expect(delta[0].attributes?.bold).toBeDefined();

    await flow.close();
    await speech.close();
  });

  it("leaves the flow sheet completely untouched (non-destructive)", async () => {
    const flow = await openFlowSheet();
    const speech = await openSpeechDoc();
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    writeArgument(flow, contentionContentFragment(c1.id), [
      { text: "Untouched" },
    ]);

    const before = flow.doc
      .getXmlFragment(contentionContentFragment(c1.id))
      .toString();

    appendFlowNodesToSpeechDoc(flow, speech, [c1.id]);

    const after = flow.doc
      .getXmlFragment(contentionContentFragment(c1.id))
      .toString();
    expect(after).toBe(before);

    await flow.close();
    await speech.close();
  });

  it("persists the appended content across a speech-doc close/reopen", async () => {
    const flow = await openFlowSheet();
    const speechId = uniqueId();
    let speech = await openSpeechDoc(speechId);
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    writeArgument(flow, contentionContentFragment(c1.id), [
      { text: "Survives reload" },
    ]);

    appendFlowNodesToSpeechDoc(flow, speech, [c1.id]);
    await speech.close();

    // A completely fresh handle over the same IndexedDB backend.
    speech = await openSpeechDoc(speechId);
    expect(bodyParagraphTexts(speech)).toEqual(["Survives reload"]);

    await flow.close();
    await speech.close();
  });

  it("appends every non-empty paragraph of a multi-paragraph box, skipping empties", async () => {
    const flow = await openFlowSheet();
    const speech = await openSpeechDoc();
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    writeArgument(flow, contentionContentFragment(c1.id), [
      { text: "First" },
      { text: "" },
      { text: "Third" },
    ]);

    const result = appendFlowNodesToSpeechDoc(flow, speech, [c1.id]);

    expect(result.paragraphCount).toBe(2);
    expect(bodyParagraphTexts(speech)).toEqual(["First", "Third"]);

    await flow.close();
    await speech.close();
  });

  it("is a no-op for an empty selection", async () => {
    const flow = await openFlowSheet();
    const speech = await openSpeechDoc();
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    writeArgument(flow, contentionContentFragment(c1.id), [{ text: "Nope" }]);

    const result = appendFlowNodesToSpeechDoc(flow, speech, []);

    expect(result).toEqual({ nodeCount: 0, paragraphCount: 0 });
    expect(bodyParagraphTexts(speech)).toEqual([]);

    await flow.close();
    await speech.close();
  });

  it("reports zero when selected containers hold no text", async () => {
    const flow = await openFlowSheet();
    const speech = await openSpeechDoc();
    const column = addColumn(flow, { label: "1AC", side: "aff" });
    const c1 = addContention(flow, column.id);
    // A contention whose box is empty (no paragraphs written).

    const result = appendFlowNodesToSpeechDoc(flow, speech, [c1.id]);

    expect(result).toEqual({ nodeCount: 0, paragraphCount: 0 });
    expect(bodyParagraphTexts(speech)).toEqual([]);

    await flow.close();
    await speech.close();
  });
});
