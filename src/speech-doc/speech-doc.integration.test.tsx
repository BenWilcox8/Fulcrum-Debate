// jsdom has no IndexedDB, so install the in-memory fake before anything reads
// the global. These tests drive the speech-doc lifecycle end to end through the
// *real* DocumentService (no mocks): the routed shell screens, the speech-doc
// seam, the shared editor, and the active-speech-doc contract - proving a speech
// doc's rich text reloads across a simulated restart and that opening one makes
// it identifiable as the active speech doc.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import AppRoutes from "../AppRoutes";
import { DocumentsProvider, useDocumentService } from "../documents/react";
import type { DocumentService } from "../documents/service";
import { createEditor } from "../editor/core";
import { editorPreset } from "../editor/preset";
import { ActiveSpeechDocProvider } from "./ActiveSpeechDocProvider";
import { createActiveSpeechDocStore } from "./active-speech-doc";
import {
  SPEECH_DOC_BODY_FRAGMENT,
  SPEECH_DOC_KIND,
  useSpeechDocs,
} from "./speech-doc";

// A fresh IndexedDB backend per test so nothing leaks between tests.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** Renders the routed shell at `path` inside fresh providers, sharing `store`. */
function renderShellAt(
  path: string,
  store = createActiveSpeechDocStore(),
) {
  const view = render(
    <DocumentsProvider>
      <ActiveSpeechDocProvider store={store}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </ActiveSpeechDocProvider>
    </DocumentsProvider>,
  );
  return { view, store };
}

/**
 * A headless harness exposing the live service and the speech-doc seam, so a
 * test can create speech docs and seed their bodies directly, then remount a
 * fresh provider to prove reload.
 */
interface Harness {
  service: DocumentService;
  createSpeechDoc: (title?: string) => Promise<string>;
}

let harness: Harness | null = null;

function CaptureHarness() {
  const service = useDocumentService();
  const { createSpeechDoc } = useSpeechDocs();
  harness = { service, createSpeechDoc };
  return null;
}

async function withHarness(run: (h: Harness) => Promise<void>) {
  harness = null;
  const view = render(
    <DocumentsProvider>
      <CaptureHarness />
    </DocumentsProvider>,
  );
  await waitFor(() => expect(harness).not.toBeNull());
  await run(harness!);
  view.unmount();
  await waitFor(() => expect(harness!.service.closed).toBe(true));
}

/** Writes rich text into a speech doc's body through the real shared editor. */
async function seedBody(
  service: DocumentService,
  id: string,
  html: string,
) {
  const handle = await service.open(id);
  await handle.whenLoaded;
  const editor = createEditor({
    binding: { handle, fragment: SPEECH_DOC_BODY_FRAGMENT },
    extensions: editorPreset(),
  });
  editor.commands.setContent(html);
  editor.destroy();
}

describe("speech-doc lifecycle integration", () => {
  it("starts a new speech doc on a fresh, empty editor backed by a new document", async () => {
    renderShellAt("/speeches");

    expect(
      await screen.findByRole("heading", { level: 2, name: /^speeches$/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no speeches yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /new speech/i }));

    // The editor surface mounts for the freshly created speech doc.
    expect(await screen.findByTestId("speech-doc-editor")).toBeInTheDocument();
  });

  it("reopens an existing speech doc and restores its rich text across a restart", async () => {
    let speechId = "";

    await withHarness(async ({ service, createSpeechDoc }) => {
      await act(async () => {
        speechId = await createSpeechDoc("Seeded speech");
      });
      await act(async () => {
        await seedBody(
          service,
          speechId,
          "<p><strong>Framing:</strong> weigh magnitude.</p>",
        );
      });
    });

    // Reopen through a completely fresh provider (simulated restart) over the
    // same IndexedDB backend: the speech doc's bold text is restored.
    renderShellAt(`/speeches/${speechId}`);

    await waitFor(() => {
      const editor = screen.getByTestId("speech-doc-editor");
      expect(editor.textContent).toContain("weigh magnitude.");
      expect(editor.querySelector("strong")).not.toBeNull();
    });
  });

  it("offers a one-click Export action on the speech doc screen", async () => {
    let speechId = "";

    await withHarness(async ({ createSpeechDoc }) => {
      await act(async () => {
        speechId = await createSpeechDoc("Exportable speech");
      });
    });

    renderShellAt(`/speeches/${speechId}`);

    expect(
      await screen.findByRole("button", { name: /export to email/i }),
    ).toBeInTheDocument();
  });

  it("makes the opened speech doc identifiable as the active speech doc", async () => {
    let speechId = "";

    await withHarness(async ({ createSpeechDoc }) => {
      await act(async () => {
        speechId = await createSpeechDoc("Active speech");
      });
    });

    const { store } = renderShellAt(`/speeches/${speechId}`);

    // Opening a speech doc marks it the active target for content pipelines,
    // queryable at the model level by its document id.
    await waitFor(() => {
      expect(store.getActiveId()).toBe(speechId);
    });
  });

  it("shows a not-found state when navigating to an unrecognised speech id", async () => {
    renderShellAt("/speeches/does-not-exist");

    expect(await screen.findByText(/speech not found/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to all speeches/i }),
    ).toBeInTheDocument();
  });

  it("lists created speech docs as speech-doc documents on the index", async () => {
    await withHarness(async ({ createSpeechDoc }) => {
      await act(async () => {
        await createSpeechDoc("Listed speech");
      });
    });

    renderShellAt("/speeches");

    expect(
      await screen.findByRole("link", { name: /listed speech/i }),
    ).toBeInTheDocument();
  });
});

describe("speech-doc-to-document mapping", () => {
  it("maps a speech doc to a speech-doc document kind", () => {
    expect(SPEECH_DOC_KIND).toBe("speech-doc");
  });
});
