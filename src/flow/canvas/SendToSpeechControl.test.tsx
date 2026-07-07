// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global. These tests drive the Send-to-Speech control end to end through the
// *real* DocumentService: selecting flow containers, then Send (button or the
// Ctrl/Cmd+Enter hotkey) appends their content to the active speech doc - and the
// deliberate no-active-speech-doc affordance.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as Y from "yjs";

import { DocumentsProvider, useDocumentService } from "../../documents/react";
import type { DocumentHandle } from "../../documents/core";
import type { DocumentService } from "../../documents/service";
import {
  ActiveSpeechDocProvider,
  createActiveSpeechDocStore,
  SPEECH_DOC_BODY_FRAGMENT,
  type ActiveSpeechDocStore,
} from "../../speech-doc";
import { addColumn } from "../columns";
import { addContention, contentionContentFragment } from "../contention";
import { FlowSheetContext, type FlowSheetContextValue } from "./flow-sheet-context";
import { useFlowCollapse } from "./useFlowCollapse";
import { useFlowSelection, type FlowSelectionState } from "./useFlowSelection";
import { SendToSpeechControl } from "./SendToSpeechControl";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

const writeArgument = (
  handle: DocumentHandle,
  fragmentName: string,
  text: string,
): void => {
  const fragment = handle.doc.getXmlFragment(fragmentName);
  handle.doc.transact(() => {
    const paragraph = new Y.XmlElement("paragraph");
    const textNode = new Y.XmlText();
    textNode.applyDelta([{ insert: text }]);
    paragraph.insert(0, [textNode]);
    const response = new Y.XmlElement("response");
    response.insert(0, [paragraph]);
    const argument = new Y.XmlElement("argument");
    argument.insert(0, [response]);
    fragment.insert(fragment.length, [argument]);
  });
};

const bodyTexts = (handle: DocumentHandle): string[] =>
  handle.doc
    .getXmlFragment(SPEECH_DOC_BODY_FRAGMENT)
    .toArray()
    .filter((n): n is Y.XmlElement => n instanceof Y.XmlElement)
    .map((p) => p.toString().replace(/<[^>]*>/g, ""));

interface Harness {
  service: DocumentService;
  selection: FlowSelectionState;
  setFlowHandle: (handle: DocumentHandle | null) => void;
}

let harness: Harness | null = null;

/** Renders the real control over a real selection/collapse and the live service. */
function HarnessComponent() {
  const service = useDocumentService();
  const selection = useFlowSelection();
  const [flowHandle, setFlowHandle] = useState<DocumentHandle | null>(null);
  const collapse = useFlowCollapse(flowHandle);

  harness = { service, selection, setFlowHandle };

  const value: FlowSheetContextValue = {
    handle: flowHandle,
    activeColumnId: null,
    setActiveColumnId: () => {},
    collapse,
    selection,
  };

  return (
    <FlowSheetContext.Provider value={value}>
      <SendToSpeechControl />
    </FlowSheetContext.Provider>
  );
}

function renderControl(store: ActiveSpeechDocStore) {
  harness = null;
  render(
    <DocumentsProvider>
      <ActiveSpeechDocProvider store={store}>
        <HarnessComponent />
      </ActiveSpeechDocProvider>
    </DocumentsProvider>,
  );
}

/** Creates a flow sheet with one content-bearing contention; returns handle + id. */
async function seedFlow(
  service: DocumentService,
  text = "Warming is real",
): Promise<{ handle: DocumentHandle; contentionId: string }> {
  const handle = await service.create({ kind: "flow-sheet", title: "Round" });
  const column = addColumn(handle, { label: "1AC", side: "aff" });
  const contention = addContention(handle, column.id);
  writeArgument(handle, contentionContentFragment(contention.id), text);
  return { handle, contentionId: contention.id };
}

describe("SendToSpeechControl", () => {
  it("disables the button until something is selected", async () => {
    renderControl(createActiveSpeechDocStore());
    await waitFor(() => expect(harness).not.toBeNull());

    const button = screen.getByTestId("send-to-speech");
    expect(button).toBeDisabled();

    const { handle, contentionId } = await seedFlow(harness!.service);
    act(() => harness!.setFlowHandle(handle));
    act(() => harness!.selection.toggle(contentionId));

    expect(screen.getByTestId("send-to-speech")).toBeEnabled();
  });

  it("appends the selected arguments to the active speech doc on click", async () => {
    const store = createActiveSpeechDocStore();
    renderControl(store);
    await waitFor(() => expect(harness).not.toBeNull());

    const { handle: flow, contentionId } = await seedFlow(
      harness!.service,
      "Extinction outweighs",
    );
    const speech = await harness!.service.create({
      kind: "speech-doc",
      title: "1AC speech",
    });

    act(() => harness!.setFlowHandle(flow));
    act(() => store.setActiveId(speech.id));
    act(() => harness!.selection.toggle(contentionId));

    fireEvent.click(screen.getByTestId("send-to-speech"));

    await waitFor(() =>
      expect(bodyTexts(speech)).toEqual(["Extinction outweighs"]),
    );
    // Selection clears after a successful send, and the flow is untouched.
    await waitFor(() => expect(harness!.selection.count).toBe(0));
    expect(
      flow.doc.getXmlFragment(contentionContentFragment(contentionId)).toString(),
    ).toContain("Extinction outweighs");
  });

  it("sends via the Ctrl/Cmd+Enter hotkey", async () => {
    const store = createActiveSpeechDocStore();
    renderControl(store);
    await waitFor(() => expect(harness).not.toBeNull());

    const { handle: flow, contentionId } = await seedFlow(
      harness!.service,
      "Hotkey send",
    );
    const speech = await harness!.service.create({
      kind: "speech-doc",
      title: "speech",
    });

    act(() => harness!.setFlowHandle(flow));
    act(() => store.setActiveId(speech.id));
    act(() => harness!.selection.toggle(contentionId));

    act(() => {
      fireEvent.keyDown(document, { key: "Enter", metaKey: true });
    });

    await waitFor(() => expect(bodyTexts(speech)).toEqual(["Hotkey send"]));
  });

  it("shows a deliberate affordance and sends nothing when no speech doc is active", async () => {
    const store = createActiveSpeechDocStore();
    renderControl(store);
    await waitFor(() => expect(harness).not.toBeNull());

    const { handle: flow, contentionId } = await seedFlow(harness!.service);
    act(() => harness!.setFlowHandle(flow));
    act(() => harness!.selection.toggle(contentionId));

    fireEvent.click(screen.getByTestId("send-to-speech"));

    await waitFor(() =>
      expect(screen.getByTestId("send-to-speech-status").textContent).toMatch(
        /no active speech doc/i,
      ),
    );
    // Selection is preserved so the debater can pick a target and retry.
    expect(harness!.selection.count).toBe(1);
  });
});
