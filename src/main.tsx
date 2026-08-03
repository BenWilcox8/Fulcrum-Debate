import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { startWindowGeometryPersistence } from "./ipc/window-geometry";
import { PreferencesProvider } from "./preferences";
import { DocumentsProvider } from "./documents/react";
import { ShorthandProvider } from "./shorthand/react";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root was not found in the document.");
}

createRoot(rootElement).render(
  <StrictMode>
    <PreferencesProvider>
      {/* Mounted outside App so App.offline-boot.test.tsx can render App alone
          without constructing a DocumentService (which requires IndexedDB). */}
      <DocumentsProvider>
        <ShorthandProvider>
          <App />
        </ShorthandProvider>
      </DocumentsProvider>
    </PreferencesProvider>
  </StrictMode>,
);

// Persist window geometry on resize/move, but only inside the Tauri webview -
// under plain `vite dev` in a browser there is no window bridge. Fire-and-forget
// so nothing in the boot path awaits it (and it awaits no network resource).
if ("__TAURI_INTERNALS__" in window) {
  void startWindowGeometryPersistence();
}
