# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Stack

- **Tauri v2** - native desktop shell (Rust), config in `src-tauri/`.
- **React + TypeScript + Vite** - front end in `src/`.
- **Tailwind CSS v4** - `@import "tailwindcss";` in `src/index.css` (no `tailwind.config.js`, no PostCSS config).
- **react-router-dom v7** - uses `HashRouter` (`src/App.tsx`) - `file://` context under Tauri.
- **Tiptap v3** - shared rich-text editor layer in `src/editor/`.
- **Yjs + y-indexeddb** - shared data types and local persistence.
- **XYFlow (`@xyflow/react` v12)** - flow-sheet canvas in `src/flow/canvas/`.

The app is strictly **local-first**: nothing in the boot/render path may await a network resource.

## Commands

- `npm run tauri dev` - native desktop window with hot reload.
- `npm run dev` - Vite front end only (browser, no shell).
- `npm run build` - type-check both tsconfigs then `vite build`.
- `npm run tauri build` - native production bundle (first Rust compile is slow).
- `npm test` / `npm run test:watch` - Vitest + React Testing Library.
- `npm run lint` - ESLint (flat config, `eslint.config.js`).
- `npm run round:drive` - Playwright E2E harness; requires `npx playwright install chromium` on first use.

## Hard product rule: local-first boot

Nothing rendered on startup (`main.tsx`, `App`, the router, `RootLayout`, or the default screen) may `await` a network resource.
Tauri IPC is allowed on the boot path but must degrade to sensible defaults so a slow read never blocks first paint.
Enforced by `src/App.offline-boot.test.tsx` - keep it green; if startup logic needs the network, the design is wrong.

## IPC command seam

Feature code calls Tauri via `src/ipc/` only - never `invoke` directly.

- Web half: `src/ipc/` - one typed wrapper per command.
- Rust half: `src-tauri/src/commands/`, registered in `src-tauri/src/lib.rs`.
- **Gotcha:** `commands/mod.rs` must use `pub use submodule::*;`, not named re-exports. `generate_handler!` needs hidden `__cmd__*` items; a named re-export fails to compile with `cannot find __cmd__<name>`.
- App commands need no ACL entry in `capabilities/default.json` - only plugin/core commands do.
- Tests mock `@tauri-apps/api/core` (real `invoke` requires the Tauri webview).

## Document service (the only entry point)

Feature code uses `openDocumentService()` from `src/documents/service` exclusively.
Never import `src/documents/core`, `src/documents/registry`, Yjs, or y-indexeddb directly from feature code.

- API surface: `create({kind,title})` / `open(id)` / `list()` / `rename(id,title)` / `remove(id)` / `close()`.
- `open(id)` returns a **cached handle** - deduplication lives in the service.
- React: use `useDocuments` / `useDocument(id)` from `src/documents/react`.
- **Gotcha:** `useDocuments` must guard `if (service.closed) return;` before subscribing. `service.subscribe` throws synchronously on a closed service; a browser reload directly to `/#/rounds/:id` can hit this during StrictMode remount. Regression pinned in `react.test.tsx`.
- Tests use `fake-indexeddb/auto` + a fresh `IDBFactory()` per test (jsdom has no IndexedDB).

Deep reference: `docs/documents-preferences-settings.md`. Dashboard home screen: `docs/screens.md`.

## Fragment convention (Yjs shared-type layout)

**A fragment name is bound to a Yjs type forever** - re-typing or renaming a shipped fragment is a bug.

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

`contention:<nodeId>` and `subpoint:<nodeId>` are per-node fragment families keyed by stable node id.
`subpoints` `Y.Map` is the membership/order store, a sibling of `nodes` (subpoints nest under a contention, not a column).

## Shared editor layer

Feature editors consume exactly two things from `src/editor/`:
- **`editorPreset(options?)`** (`src/editor/preset.ts`) - extension bundle. Pass `extensions` and `headingLevels` for feature additions.
- **`DocumentEditor`** (`src/editor/react/`) - editable React surface; `useDocumentEditor` for the raw `Editor`.

**Never add a `History`/StarterKit undo extension.** The `Collaboration` binding already installs the Yjs undo plugin; a ProseMirror history extension creates a second conflicting stack.

Mark schemas are stable contracts: bold = `bold` mark (`<strong>`), highlight = `highlight` mark (`<mark>`, `multicolor: false`), font size = `textStyle` mark with `fontSize` from `FONT_SIZE_SCALE`.

## Flow sheet

Three module groups, layered bottom-up:
- `src/flow/` - data substrate: column + node CRUD/observe helpers. Import from `src/flow`.
- `src/flow/canvas/` - XYFlow canvas (`FlowCanvas`), `ColumnControls`, `FlowSheetPanel`. Import from `src/flow/canvas`.
- `src/rounds/` - a round *is* a `flow-sheet` document; `useRounds()` in `src/rounds/rounds.ts`.

Full canvas gotchas and flow-node features: `docs/flow-sheet.md`.

## Deep reference (docs/)

Read the relevant doc before working in that area.

- **`docs/documents-preferences-settings.md`** - recent-documents query, preference store, Settings screen.
- **`docs/screens.md`** - Dashboard home screen.
- **`docs/flow-sheet.md`** - flow canvas gotchas + all flow-node features.
- **`docs/shorthand.md`** - abbreviation→expansion dictionary, transition-time expansion engine.
- **`docs/timer.md`** - floating timer widget.
- **`docs/speech-doc.md`** - Speech Doc editor + model, split-screen docking, Send Flow, drag-a-card.
- **`docs/block-file.md`** - block-file schema, card anatomy/tag system.
- **`docs/formatting.md`** - evidence formatting profile + preferences.
- **`docs/tools.md`** - card-cutting tool framework, Auto Speech transform engine.
- **`docs/toc.md`** - ToC sidebar, bulk-send→Speech Doc pipeline.
- **`docs/export.md`** - Export & Sharing (Email, SpeechDrop).
- **`docs/e2e-harness.md`** - round-driver E2E harness, narrow-viewport variant, Playwright gotchas.

## Sharp edges

- **TypeScript build:** uses two `tsc -p ... --noEmit` passes (no project references). Keep `noEmit: true` in both tsconfigs; do not add `references`/`composite`.
- **Rust toolchain** must be on `PATH`: `source "$HOME/.cargo/env"` if `cargo` is missing.
- **App icons:** `src-tauri/app-icon.svg` is source of truth. Regenerate with `npm run tauri icon src-tauri/app-icon.svg`.
- **CSP:** `tauri.conf.json` enforces `default-src 'self'`. Add explicit directives for any future feature needing fonts, external images, or eval.
- **Playwright E2E gotchas** (flow-canvas click dispatch, editor blur before `C#`/`S#` triggers, export payload-capture stub): see `docs/e2e-harness.md`; export's plain-browser graceful-degradation guard: `docs/export.md`.

## Design tokens

All tokens are in `src/index.css` `@theme` block. Use named tokens, never raw hex.
Key families: `aff`/`aff-soft`/`aff-strong` (blue), `neg`/`neg-soft`/`neg-strong` (red), `shell-*` surface colors, `spacing-card`/`spacing-section`. Apply as Tailwind utilities: `bg-aff-soft`, `text-neg`, `p-card`, etc.

## CI

`.github/workflows/ci.yml`: two parallel jobs - **lint-and-test** (ESLint + Vitest, ubuntu) and **tauri-build** (`npm run tauri build`, macos).

## Round-driver E2E harness

The `e2e/` Playwright harness plays a full debate round and emits screenshots for visual regression.
Run `npm run round:drive` (capture) or `npm run round:vrt` (VRT).
Full detail, narrow-viewport variant, and Playwright gotchas: `docs/e2e-harness.md`.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
Deep, subsystem-specific reference belongs in `docs/<topic>.md` with a one-line pointer here, not inline.
