# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Stack (fixed by the product owner)

- **Tauri v2** - native desktop shell (Rust), config in `src-tauri/`.
- **React + TypeScript + Vite** - front end in `src/`.
- **Tailwind CSS v4** - via the `@tailwindcss/vite` plugin; global styles are `@import "tailwindcss";` in `src/index.css` (no `tailwind.config.js`, no PostCSS config).
- **react-router-dom v7** - uses `HashRouter` (`src/App.tsx`) - `file://` context under Tauri has no server to resolve real paths.
- **Tiptap v3** - shared rich-text editor layer in `src/editor/`: factory (`core/`), marks (`marks/`), headings + outline (`headings/`), preset (`preset.ts`), React primitive (`react/`).
- **Yjs + y-indexeddb** - shared data types and local persistence.
- **XYFlow (`@xyflow/react` v12)** - the flow-sheet canvas in `src/flow/canvas/`.

The app is strictly **local-first**: nothing in the boot/render path may await a network resource.

## Commands

- `npm run tauri dev` - launch the native desktop window with hot reload.
- `npm run dev` - Vite front end only (browser, no shell).
- `npm run build` - type-check both tsconfigs then `vite build`.
- `npm run tauri build` - native production bundle (first Rust compile is slow).
- `npm test` / `npm run test:watch` - Vitest + React Testing Library.
- `npm run lint` - ESLint (flat config, `eslint.config.js`).
- `npm run round:drive` - Playwright round-driver E2E harness (see "Round-driver E2E harness" below); requires `npx playwright install chromium` on first use.

## Hard product rule: local-first boot

Nothing rendered on startup (`main.tsx`, `App`, the router, `RootLayout`, or the default screen) may `await` a network resource.
Tauri IPC is local (not network) and is allowed on the boot path, but must degrade to sensible defaults so a slow read never blocks first paint.
Enforced by `src/App.offline-boot.test.tsx` - keep it green; if startup logic needs the network, the design is wrong.

## IPC command seam

Feature code calls Tauri via `src/ipc/` only - never `invoke` directly.

- Web half: `src/ipc/` - one typed wrapper per command.
- Rust half: `src-tauri/src/commands/` - every `#[tauri::command]`, registered via `generate_handler!` in `src-tauri/src/lib.rs`.
- **Gotcha - submodule re-export must be glob:** `commands/mod.rs` must use `pub use submodule::*;`, not a named re-export. `generate_handler!` needs the hidden `__cmd__*` items the macro emits; a named re-export fails to compile with `cannot find __cmd__<name>`.
- App commands need no ACL entry in `capabilities/default.json` - only plugin/core commands do.
- Tests mock `@tauri-apps/api/core` (real `invoke` requires the Tauri webview).

## Document service (the only entry point)

Feature code uses `openDocumentService()` from `src/documents/service` exclusively.
Never import `src/documents/core`, `src/documents/registry`, Yjs, or y-indexeddb directly from feature code.

- `create({kind,title})` / `open(id)` / `list()` / `rename(id,title)` / `remove(id)` / `close()` are the whole surface.
- `open(id)` returns a **cached handle** - deduplication lives in the service, not the core.
- Every method awaits local registry load (`whenReady`); nothing awaits the network.
- React integration: `DocumentsProvider` is mounted in `src/main.tsx` (outside `App`) so `App.offline-boot.test.tsx` never constructs a service. Use `useDocuments` / `useDocument(id)` from `src/documents/react`.
- **Gotcha - `useDocuments` must bail on a closed service.** `service.subscribe` throws synchronously on a closed service, so `useDocuments`'s effect guards `if (service.closed) return;` before subscribing (mirroring the dashboard's `useResumeDocuments`). Without it, a browser reload landing **directly** on a document screen (e.g. `/#/rounds/:id`) crashes the whole tree to a blank page: the screen's `useRounds` → `useDocuments` runs its subscribe effect during the window where `DocumentsProvider`'s StrictMode/remount swap has closed the old service but not yet provided the fresh one. The fresh service re-runs the effect, so the guard just skips the transient closed instance. `useDocument(id)` is already safe (it opens via the **async** `service.open`, whose rejection is caught). Regression pinned in `react.test.tsx` ("does not throw when the service in context is already closed").
- Tests use `fake-indexeddb/auto` + a fresh `IDBFactory()` per test (jsdom has no IndexedDB).

Deep reference for the recent-documents query, the namespaced preference store core (+ React bindings + persistence), and the Settings screen shell: `docs/documents-preferences-settings.md`. The prep-centric Dashboard home screen: `docs/screens.md`.

## Fragment convention (Yjs shared-type layout)

Each document's content lives in named top-level Yjs shared types ("fragments") on `handle.doc`.
**A fragment name is bound to a Yjs type forever** - Yjs fixes the type on first access; re-typing or renaming a shipped fragment is a bug.
Reserved fragments:

| Kind | Fragment | Yjs type | Constant |
|---|---|---|---|
| `flow-sheet` | `columns` | `Y.Array<Y.Map>` | `FLOW_COLUMNS_FRAGMENT` |
| `flow-sheet` | `nodes` | `Y.Map<Y.Map>` | `FLOW_NODES_FRAGMENT` |
| `flow-sheet` | `contention:<nodeId>` | `Y.XmlFragment` | `contentionContentFragment(nodeId)` |
| `flow-sheet` | `subpoints` | `Y.Map<Y.Map>` | `FLOW_SUBPOINTS_FRAGMENT` |
| `flow-sheet` | `subpoint:<nodeId>` | `Y.XmlFragment` | `subpointContentFragment(nodeId)` |
| `flow-sheet` | `edges` | `Y.Map<Y.Map>` | `FLOW_EDGES_FRAGMENT` |
| `flow-sheet` | `rfd` | `Y.XmlFragment` | `FLOW_RFD_FRAGMENT` |
| `block-file` | `body` | `Y.XmlFragment` | `BLOCK_FILE_FRAGMENT` |
| `speech-doc` | `body` | `Y.XmlFragment` | `SPEECH_DOC_BODY_FRAGMENT` |

The `contention:<nodeId>` and `subpoint:<nodeId>` rows are each a **family** of per-node fragments, one `XmlFragment` per node keyed by its stable node id (not a single fixed name) - each contention's/subpoint's text is an independent Tiptap surface. Same "one fragment name binds to one type forever" rule applies: a given node id's name never re-types. The `subpoints` `Y.Map` is the subpoints' own membership/order store, a sibling of `nodes` (subpoints nest under a *contention*, not a column, so they live outside `nodes`).

## Shared editor layer

Feature editors consume exactly two things from `src/editor/`:
- **`editorPreset(options?)`** (`src/editor/preset.ts`) - the agreed extension bundle (bold + highlight + font-size + headings). Pass `extensions` and `headingLevels` options for feature-specific additions.
- **`DocumentEditor`** (`src/editor/react/`) - the editable React surface; takes a `DocumentHandle` + `fragment` name. `useDocumentEditor` is the hook form for callers that need the raw `Editor`.

**Never add a `History`/StarterKit undo extension.** The `Collaboration` binding already installs the Yjs undo plugin; a ProseMirror history extension creates a second conflicting stack.

Mark schemas are stable contracts (other tools read them): bold = `bold` mark (`<strong>`), highlight = `highlight` mark (`<mark>`, `multicolor: false`), font size = `textStyle` mark with `fontSize` attribute from `FONT_SIZE_SCALE`.

## Flow sheet

Three module groups, layered bottom-up:
- `src/flow/` - data substrate: column + node CRUD/observe helpers. Import the whole model surface from `src/flow`.
- `src/flow/canvas/` - XYFlow canvas (`FlowCanvas`), write strip (`ColumnControls`), composited panel (`FlowSheetPanel`). Import from `src/flow/canvas`.
- `src/rounds/` - a round *is* a `flow-sheet` document; `useRounds()` in `src/rounds/rounds.ts` is the whole seam.

Canvas gotchas (RootLayout `h-screen`, `pointer-events-auto` on `SpeechColumnNode`, `PinViewportToTop`, 2D-at-volume panning, `ColumnControls` height cap, driving the canvas under Playwright, the jsdom `ResizeObserver` stub) and every flow-node feature (contentions/subpoints and their `C#`/`S#` triggers, argument rows, node collapsing, cross-application copy+arrow, strike-on-drop, RFD): `docs/flow-sheet.md`.

## Deep reference (docs/)

Subsystem deep-dives live under `docs/`. Read the relevant one before working in that area; each was moved verbatim from this file so no rule was lost.

- **`docs/documents-preferences-settings.md`** - recent-documents query, preference store core + React bindings + persistence, Settings screen shell.
- **`docs/screens.md`** - Dashboard home screen (Resume/Recent, Start-new, Library zones; `/rounds/new` create-and-redirect).
- **`docs/flow-sheet.md`** - flow canvas gotchas + all flow-node features (contentions, subpoints, argument rows, collapsing, cross-apply, strike, RFD).
- **`docs/shorthand.md`** - abbreviation→expansion dictionary, transition-time expansion engine, flow wiring + surface-generic scope gate.
- **`docs/timer.md`** - floating timer widget (prep/speech countdowns, draggable+persisted position, collapse).
- **`docs/speech-doc.md`** - Speech Doc editor + model, split-screen docking, Send Flow pipeline, drag-a-card pipeline.
- **`docs/block-file.md`** - block-file side schema, card anatomy/tag system, card-unit addressability API, quick card creation.
- **`docs/formatting.md`** - evidence formatting profile + preferences, unformatted-shrink rule, live card rendering.
- **`docs/tools.md`** - card-cutting tool framework, toolbar + per-tool Settings, every shipped tool, shared highlighted-runs query, Auto Speech transform engine + clipboard tool.
- **`docs/toc.md`** - ToC sidebar + selection, ToC bulk-send→Speech Doc pipeline.
- **`docs/export.md`** - Export & Sharing (Email `mailto:` via `open_external`, SpeechDrop upload via `speechdrop_upload`).
- **`docs/e2e-harness.md`** - round-driver E2E harness (`npm run round:drive` / `round:vrt`), narrow-viewport variant, hard-won Playwright gotchas.

## Sharp edges

- **TypeScript build:** uses two plain `tsc -p ... --noEmit` passes, not project references. Keep `noEmit: true` in both tsconfigs; do not add `references`/`composite` (`tsc -b` errors TS6310/TS6306 with `noEmit`).
- **Rust toolchain** must be on `PATH` for any `tauri` command: `source "$HOME/.cargo/env"` if `cargo` is missing.
- **App icons:** `src-tauri/app-icon.svg` is the source of truth. Regenerate with `npm run tauri icon src-tauri/app-icon.svg`. Keep only the desktop assets: `src-tauri/icons/{32x32,64x64,128x128,128x128@2x}.png`, `icon.icns`, `icon.ico`, `icon.png`.
- **CSP:** `tauri.conf.json` enforces `default-src 'self'`. Inline scripts/styles and all external loads are blocked. Add an explicit CSP directive for any future feature that needs fonts, external images, or eval.
- **Driving the flow canvas + export in a headless browser (Playwright E2E over `npm run dev`):** three non-obvious gotchas, all verified against the send-flow → speech-doc → export path.
  - **Flow-canvas nodes need `locator.dispatchEvent("click")`, not `.click()`.** The XYFlow wrapper (`[data-testid="rf__wrapper"]`) intercepts pointer events at the node's coordinates, so a real (or even `force:true`) click lands on the wrapper and the node's React `onClick` never fires - the active-column ring never appears and the `C#` trigger has nowhere to land. `dispatchEvent` targets the node element directly and bubbles to React's handler. Shift-select works the same way: `node.dispatchEvent("mousedown", { shiftKey: true })` (selection is on `onMouseDownCapture` gated by `event.shiftKey`).
  - **Blur the editor before the document-wide `C#`/`S#` trigger.** The trigger ignores keystrokes aimed at an editable target, so after typing into one contention the next `C2`+Enter lands as *text inside that box* (creating an argument row) unless you first `page.evaluate(() => document.activeElement?.blur())`. Type contention bodies via `el.focus()` + `keyboard.type`; jsdom's `isContentEditable` gap does not apply in a real browser, so the trigger correctly ignores editor-aimed keys once focus is right.
  - **Export degrades gracefully in a plain browser (no stub needed for UI exercise).** `openExternal` and `uploadToSpeechDrop` guard on `isTauriAvailable()` (`"__TAURI_INTERNALS__" in window`) and reject with a friendly "desktop app only" message before `invoke` is called, so clicking Export surfaces a readable status line rather than a raw TypeError. The round-driver E2E relies on this: it clicks the button and asserts the status line is non-empty without any `__TAURI_INTERNALS__` stub. **Stub `window.__TAURI_INTERNALS__.invoke`** (via `context.addInitScript`) only if you need to *capture and verify the actual payload*: `open_external` carries the `mailto:?subject=…&body=…` draft; `speechdrop_upload` carries `{ roomCode, fileName, contentType, contentBase64 }` whose base64 is the RTF (bold survives as `\b…\b0`, openable with `textutil`).

## Design tokens

All tokens are defined in `src/index.css` inside the Tailwind v4 `@theme` block. Use named tokens, never raw hex.

### Debate side colors

| Token | Value | Usage |
|---|---|---|
| `aff-soft` | #dbeafe | Aff bg tints, badges |
| `aff` | #3b82f6 | Aff primary accent |
| `aff-strong` | #1d4ed8 | Aff headers, borders, interactive |
| `neg-soft` | #fee2e2 | Neg bg tints, badges |
| `neg` | #ef4444 | Neg primary accent |
| `neg-strong` | #b91c1c | Neg headers, borders, interactive |

Apply as Tailwind utilities: `bg-aff-soft`, `text-neg`, `border-aff-strong`, etc.

### Shell surface colors

| Token | Value | Usage |
|---|---|---|
| `shell-bg` | #f1f5f9 | App/page background |
| `shell-surface` | #ffffff | Cards, panels |
| `shell-border` | #cbd5e1 | Dividers, outlines |
| `shell-text` | #0f172a | Primary body copy |
| `shell-muted` | #64748b | Secondary/hint text |

### Spacing tokens

| Token | Value | Usage |
|---|---|---|
| `spacing-card` | 1.5rem | Inner card/panel padding |
| `spacing-section` | 2rem | Gap between major sections |

Apply as: `p-card`, `gap-section`, etc. (Tailwind v4 maps `--spacing-*` to spacing utilities).
No custom type scale; use Tailwind's built-in `text-xs` through `text-4xl`.

## CI

`.github/workflows/ci.yml` runs two parallel jobs on pull requests and pushes to `main`:
- **lint-and-test** - ESLint + Vitest on `ubuntu-latest`.
- **tauri-build** - `npm run tauri build` on `macos-latest`. No code signing or artifact publishing; build failure fails CI.


## Round-driver E2E harness

The `e2e/` Playwright harness plays a complete realistic debate round through the real UI and emits an ordered screenshot sequence; it doubles as pixel-level visual regression. Run `npm run round:drive` (capture) or `npm run round:vrt` (VRT); first use needs `npx playwright install chromium`. Full detail, the narrow-viewport variant, and the hard-won gotchas: `docs/e2e-harness.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
Deep, subsystem-specific reference belongs in `docs/<topic>.md` with a one-line pointer here, not inline.
