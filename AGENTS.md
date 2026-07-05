# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Stack (fixed by the product owner)

- **Tauri v2** - native desktop shell (Rust), config in `src-tauri/`.
- **React + TypeScript + Vite** - front end in `src/`.
- **Tailwind CSS v4** - via the `@tailwindcss/vite` plugin; global styles are `@import "tailwindcss";` in `src/index.css` (no `tailwind.config.js`, no PostCSS config).
- **react-router-dom v7** - client-side routing for the app frame. Uses `HashRouter` (see `src/App.tsx`) because the app is served from a `file://` context under Tauri with no server to resolve real paths.
- **Tiptap v3** - rich-text editor core in `src/editor/core/` (headless factory + Yjs binding). React component and marks are follow-up tasks.
- **Yjs + y-indexeddb** - shared data types and local persistence, used by the document and editor layers.
- Planned but **not yet added**: XYFlow. Do not introduce it until its own task lands.

The app is strictly **local-first**: nothing in the boot/render path may await a network resource.

## Commands

- `npm run tauri dev` - launch the native desktop window with hot reload.
- `npm run dev` - Vite front end only (browser, no shell).
- `npm run build` - type-check both tsconfigs then `vite build`.
- `npm run tauri build` - native production bundle (first Rust compile is slow and fetches crates).
- `npm test` / `npm run test:watch` - Vitest + React Testing Library.
- `npm run lint` - ESLint (flat config, `eslint.config.js`).

## IPC command seam

The web front end and the Rust backend communicate through a single typed seam. Feature code must go through it rather than calling `invoke` directly.

- **Web half:** `src/ipc/` wraps `@tauri-apps/api`'s `invoke` in one typed function per command. Command names, argument shapes, and return types live here and nowhere else. Import from `src/ipc` in feature code.
- **Rust half:** `src-tauri/src/commands/` holds every `#[tauri::command]`; they are registered in the builder via `generate_handler!` in `src-tauri/src/lib.rs`. Add new commands here, not by editing the builder wiring elsewhere.
- **No ACL entry needed for app commands:** commands defined in the app crate are not gated by the Tauri v2 capability ACL - only plugin/core commands need permission entries in `capabilities/default.json`. Adding an app command requires no capability change.
- **Return-type mirroring:** a Rust command that returns a `#[derive(Serialize)]` struct must have a matching TypeScript interface in `src/ipc` (e.g. Rust `Pong` <-> TS `Pong`). Keep them in sync when either changes.
- **Testing:** the real `invoke` needs the Tauri webview and cannot run under Vitest/jsdom, so `src/ipc/*.test.ts` mocks `@tauri-apps/api/core`. Rust command handlers are unit-tested directly in `src-tauri/src/commands/`.
- **Submodule commands need a glob re-export:** a command defined in a submodule of `commands/` (e.g. `commands/preferences.rs`) must be surfaced from `commands/mod.rs` with `pub use submodule::*;`, not a named `pub use submodule::{cmd};`. `generate_handler!` needs the hidden `__cmd__*` items the `#[tauri::command]` macro generates alongside the function, and only the glob carries them; a named re-export fails to compile with `cannot find __cmd__<name>`.

## Preferences store

App preferences are a Rust-owned JSON store reached through the IPC seam - no store plugin, so no capability ACL entry.

- **Rust side:** `src-tauri/src/commands/preferences.rs` owns `preferences.json` in the app config dir (`app.path().app_config_dir()`). The `Preferences`/`Theme` types derive `Default`; the struct is `#[serde(default)]` so partial or older files fill missing keys instead of failing. A missing or corrupt file yields `Preferences::default()` (theme `light`), never an error - only an unresolvable config dir or a failed write surfaces as `Err`. File I/O is factored into `AppHandle`-free `load_from_dir`/`save_to_dir(&Path)` cores so they unit-test against a `tempfile::tempdir()` (a `[dev-dependencies]` addition). Commands: `get_preferences`, `set_preferences` (echoes back what it saved).
- **Web side:** `src/ipc` exports `Preferences`, `Theme` (`"light" | "dark"`, mirrors the lowercase-serialized Rust enum), `DEFAULT_PREFERENCES`, and `getPreferences`/`setPreferences`. `src/preferences/` holds `PreferencesProvider` (loads the store in a non-blocking effect, renders `DEFAULT_PREFERENCES` synchronously first so the boot path never awaits) and the `usePreferences` hook (throws outside a provider). The provider is mounted in `src/main.tsx`. Context, provider, and hook are split into separate files to satisfy the react-refresh `only-export-components` lint rule.
- Theme is seeded to prove the round trip; wiring it to actually switch visuals is a later task.

## Local-first boot

The app must reach a fully rendered shell from local state alone.
This is a hard product rule, not a nice-to-have.

- **No network on the boot path.** Nothing rendered on startup - `main.tsx`, `App`, the router, `RootLayout`, or the default screen - may `await` a network resource (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or any transport built on them). There is no login gate, spinner, or connecting screen; the shell paints synchronously.
- **IPC is local, not network.** Tauri IPC (`invoke`, via the `src/ipc` seam) talks to the in-process Rust backend, so boot-time IPC reads (e.g. window geometry, preferences) are allowed. They must still degrade to sensible defaults so a slow or failed read never blocks first paint.
- **Enforced by test.** `src/App.offline-boot.test.tsx` mounts the real root `App` with every network transport stubbed to throw and asserts the full layout (nav chrome + default Dashboard) still renders. It mocks `@tauri-apps/api/core`'s `invoke` (per the IPC seam's testing note) so IPC-backed boot reads exercise without a webview, while leaving network stubbed to fail. If you add startup logic, keep this test green - if it needs the network to boot, the design is wrong, not the test.

## Window geometry persistence

The main window's size and position are persisted so relaunching restores the previous workspace.
This is hand-rolled through the IPC seam (not `tauri-plugin-window-state`) because the plugin saves on clean exit only, which would lose geometry on a force-quit; the requirement is debounced save-on-change.

- **Rust owns storage:** `src-tauri/src/commands/window_state.rs` reads/writes `window-geometry.json` in the app config dir and is the source of truth for defaults and validation.
  `restore()` runs in the Tauri `setup` hook to apply saved geometry before the window is shown, so there is no visible jump.
  The `main` window is `"visible": false` in `tauri.conf.json` precisely so `restore()` can size/position it and then `show()`.
- **Defaults/validation:** missing, unreadable, or corrupt state falls back to defaults (1200x800, OS-chosen position) mirroring the window config; an implausible size collapses to defaults, an implausible position is dropped while size is kept.
- **Web drives saves:** `src/ipc/window-geometry.ts` listens to resize/move and saves via `saveWindowGeometry` on a debounce (`GEOMETRY_SAVE_DEBOUNCE_MS`, default 400ms), so the latest geometry survives a force-quit.
  Wiring is started from `main.tsx` only inside the webview (guarded by `"__TAURI_INTERNALS__" in window`) and is fire-and-forget so nothing in the boot path awaits it.
- **Where the tests live:** the debounce logic is a pure `createGeometryPersister` unit-tested with fake timers + a mocked save; the Rust load/save/parse logic is unit-tested directly. The `@tauri-apps/api/window` wiring needs the real webview and is not unit-tested.

## Document core (Yjs + IndexedDB)

Every artifact a debater creates - flow sheet, speech doc, block file - is a Yjs `Y.Doc` persisted locally to IndexedDB via `y-indexeddb`.
`src/documents/core/` is the foundation layer only: a document handle, its persistence binding, a local load signal, and teardown.
The registry (metadata index) lives in `src/documents/registry/`; the service API lives in `src/documents/service/`; React integration lives in `src/documents/react/`.

- **The handle:** `openDocument({ id, kind })` in `src/documents/core/document-handle.ts` wraps a fresh `Y.Doc` plus an `IndexeddbPersistence` provider keyed to the id, and returns a `DocumentHandle` carrying `id`, `kind`, `doc`, `dbName`, `whenLoaded`, `loaded`, `closed`, and `close()`. Import from `src/documents/core`.
- **Kinds:** `DocumentKind` is a minimal string-literal union (`flow-sheet` | `speech-doc` | `block-file`) in `kind.ts`, with `DOCUMENT_KINDS` and an `isDocumentKind` guard. Add a kind only when a genuinely new artifact type needs its own document.
- **Per-id database:** each document lives in its own IndexedDB database named `fulcrum:doc:<id>` (`DOCUMENT_DB_PREFIX` + id, via `documentDbName`). Opening the same id twice yields two independent handles on the same store - deduplication is the service's job, not this layer's.
- **Local load signal:** `whenLoaded` resolves (and `loaded` flips to `true`) from the provider's local `whenSynced` alone - purely local IndexedDB read completion, never any network. Treat local-persistence success as a first-class, network-independent state. Edit shared types (`doc.getText`, `doc.getMap`, ...) only after awaiting `whenLoaded`: y-indexeddb drops updates until its `db` is set, which coincides with the synced signal.
- **No imposed schema:** this layer stores no shared-type layout. Callers read/mutate shared types directly off `handle.doc`; the concrete per-kind layout is deferred to the feature tasks. The conventions that govern that layout are the [Document model contract](#document-model-contract-shared-type-conventions) below.
- **Teardown:** `close()` is idempotent - it `await`s `provider.destroy()` (detaches listeners, `db.close()` which still commits in-flight writes) then `doc.destroy()`. A closed handle can be reopened by the same id with identical content.
- **Tests:** `document-handle.test.ts` imports `fake-indexeddb/auto` (jsdom has no IndexedDB) and resets `globalThis.indexedDB = new IDBFactory()` per test. Assertions are behavioral - content survives a brand-new handle/provider - never IndexedDB internals.

## Document registry (metadata index)

The registry is the sibling index to the document core: one locally-persisted store holding *metadata* (never content) for every document - `id`, `kind`, `title`, `createdAt`, `lastEditedAt`.
`src/documents/registry/` is the registry primitive only.
The service API (create/open/list/rename/delete orchestration) lives in `src/documents/service/` and drives these primitives; React integration lives in `src/documents/react/`. Cross-layer orchestration (e.g. also deleting a document's content database on `remove`) belongs to the service, not here.

- **The handle:** `openRegistry()` in `src/documents/registry/registry.ts` returns a `DocumentRegistry` with `whenLoaded`/`loaded`/`closed`, reads (`get(id)`, `list()`), writes (`add`, `updateTitle`, `touch`, `remove`), `track(handle)`, `subscribe(listener)`, and `close()`. Import from `src/documents/registry`.
- **Persistence - same binding, well-known store, no `openDocument`:** the registry is *not* a debate artifact, so it does not go through `openDocument` (which is artifact-shaped and demands a `DocumentKind`). It owns one well-known Y.Doc under a sibling namespace `REGISTRY_DB_NAME` (`"fulcrum:registry"`, a sibling of the core's `fulcrum:doc:<id>`), bound by the same `IndexeddbPersistence` provider the core uses - reusing the core's binding, not new machinery. `whenLoaded` reflects local IndexedDB read completion alone; nothing awaits the network.
- **Layout:** a top-level `entries` Y.Map keyed by document id, each value a nested Y.Map of the five fields. `add` writes the whole entry in one `doc.transact` so observers never see a half-built entry.
- **Listing order:** `list()` returns entries by `lastEditedAt` descending, tie-broken by `createdAt` descending then `id` - a stable, total order.
- **Last-edited maintenance (two primitives, no Yjs leak):** `touch(id, at?)` is the low-level "bump last-edited" primitive the service calls when it knows an edit happened. `track(handle)` is the ergonomic form: hand it an open `DocumentHandle` and the registry subscribes to that document's own `update` stream and calls `touch` on genuine local edits, returning an unsubscribe (also auto-detached on `doc` destroy). Callers pass a handle, never a `Y.Doc`/provider, so no Yjs detail crosses the seam. Updates y-indexeddb applies while *loading* a document (origin `instanceof IndexeddbPersistence`) are skipped, so merely opening a document is not an edit. `updateTitle` bumps `lastEditedAt` too - a rename is a user-visible change.
- **Tests:** `registry.test.ts` follows the core pattern - `fake-indexeddb/auto` + a fresh `IDBFactory()` per test, behavioral assertions. State survives a fresh `openRegistry()` over the same backend (the simulated-restart test).

## Document service (create/open/list/rename/delete)

The service is the single seam every feature consumes for document lifecycle; it composes the core (content) and the registry (metadata) so feature code never touches Yjs / y-indexeddb / the core or registry primitives directly.
`src/documents/service/` is the service module only - no React integration and no editor UI.

- **The handle:** `openDocumentService()` in `src/documents/service/service.ts` returns a `DocumentService` with `whenReady`, `create({kind,title})`, `open(id)`, `list()`, `rename(id,title)`, `remove(id)`, and `close()`. Import from `src/documents/service`.
- **Owns the registry, one handle per id:** the service owns a single `openRegistry()` instance for its lifetime and a `Map<id, {handle, untrack}>` of open documents. `create` mints an id (`crypto.randomUUID`), `registry.add`s the entry, `openDocument`s the content, and `registry.track`s it; `open` returns the *same cached handle* on repeated calls (this is where handle deduplication lives - the core deliberately hands back an independent handle every call). `open` throws for an unregistered id.
- **`remove` is a complete removal:** it closes+untracks any open handle for the id first (releasing the IndexedDB connection so the delete is not blocked), `registry.remove`s the entry, then deletes the content database (`indexedDB.deleteDatabase(documentDbName(id))`, resolved via a promise wrapping the request - do not resolve on `onblocked`, the delete completes and fires `onsuccess` once the closing connection drops). Reopening the id afterwards yields an empty document.
- **Readiness + lifecycle:** every method `await`s `registry.whenLoaded` (exposed as `whenReady`) so listings and duplicate checks see persisted state; nothing awaits the network. Methods throw after `close()`. `close()` untracks+closes every open handle then closes the registry, and is idempotent.
- **No new primitives:** the service composes the existing core/registry public APIs unchanged - `rename` is `registry.updateTitle` (which bumps `lastEditedAt`), edit-driven last-edited bumps come from `registry.track`.
- **Tests:** `service.test.ts` follows the established pattern - `fake-indexeddb/auto` + fresh `IDBFactory()` per test, behavioral. Key cases: create->edit->reload through a fresh service returns the same content and list; `remove` wipes both the entry and the content database (asserted via `indexedDB.databases()`); reopening a removed id sees empty content.
- **Service exposes `subscribe` + `closed`:** beyond create/open/list/rename/remove, the service also has `subscribe(listener)` (delegates to `registry.subscribe`, so React observes the document set through the seam, never the registry directly) and a `closed` getter (mirrors the handle/registry flag, used by the React provider to detect a StrictMode-closed service and recreate it).

## Document service React integration (provider + hooks)

`src/documents/react/` is the only React seam onto the document service; it follows the preferences provider/hook split (context, provider, hooks in separate files for the react-refresh `only-export-components` lint) and composes the service - React never touches the core/registry primitives, Yjs, or y-indexeddb.

- **The provider:** `DocumentsProvider` (`DocumentsProvider.tsx`) owns one `openDocumentService()` for the app: created synchronously in a `useState` initializer (opening awaits no network - it only binds the local registry), closed on unmount. It renders children immediately with no gate, so the local-first boot rule holds. Mounted in `src/main.tsx` inside `PreferencesProvider`. It is deliberately *not* mounted inside `App`, so `App.offline-boot.test.tsx` (which renders `App` without providers and has no IndexedDB) never constructs a service.
- **StrictMode safety:** the mount effect closes the service on cleanup; because `close()` is idempotent and the service exposes `closed`, the effect detects a service closed by a prior StrictMode cleanup and mints a fresh one (`if (service.closed) setService(openDocumentService())`). Production mounts create exactly one service.
- **`useDocuments`:** returns the live `documents` listing (recency-ordered), a `loading` flag, and the `create`/`rename`/`remove` mutations as stable callbacks. It reads once on `service.whenReady`, then stays subscribed via `service.subscribe`, so the listing re-renders on any create/rename/touch/remove - including edit-driven `lastEditedAt` bumps from tracked documents.
- **`useDocument(id)`:** opens the id through the service and exposes `{ handle, loaded, version }`; `version` increments on every local `doc.on("update")` so the component re-renders on content edits. Nullish id yields a null handle (safe to call unconditionally). Crucially it does **not** close the handle on unmount/id-change - the service owns and caches one handle per id (shared across consumers); the hook only detaches its own update listener. Closing is the service's job (`remove`/`close`).
- **`useDocumentService`:** low-level accessor (throws outside a provider) for the raw service; prefer the two higher-level hooks.
- **Tests:** `react.test.tsx` drives the real service under `fake-indexeddb/auto` (no mocks) via Testing Library: children render synchronously, the listing live-updates through create/rename/remove, a content edit re-renders `useDocument`, the provider closes its service on unmount, and an id-change does not close the service-owned handle.

## Document model contract (shared-type conventions)

This is the canonical contract every later editor PRD (flow sheet, speech doc, block file) builds on.
The three modules above - core (`src/documents/core`), registry (`src/documents/registry`), service (`src/documents/service`) - are the implementation; this section is the agreement between them and the feature code that consumes them.
When the contract and an implementation note disagree, the contract is the intent and the code is a bug.

### Document kinds

`DocumentKind` (`src/documents/core/kind.ts`) is a closed string-literal union; every persisted document declares exactly one.

| Kind | Artifact | What it is |
|---|---|---|
| `flow-sheet` | Flow sheet | Arguments tracked across the speeches of a round. |
| `speech-doc` | Speech doc | The text a debater reads or drafts. |
| `block-file` | Block file | Reusable prewritten arguments / evidence. |

`DOCUMENT_KINDS` is the runtime list and `isDocumentKind` the guard.
Keep the union minimal - add a kind only when a genuinely new top-level artifact type needs its own document, and in the same change give it a row here and a fragment reservation (below).

### Where a kind's content lives (fragment convention)

The core imposes no schema: a document's content is whatever Yjs shared types a caller instantiates by name off `handle.doc` (`doc.getText(name)`, `doc.getMap(name)`, `doc.getArray(name)`, `doc.getXmlFragment(name)`).
The concrete per-kind layouts are deliberately deferred to each kind's feature PRD, so what is fixed *now* is the convention that keeps those independently-authored layouts from colliding - not the layouts themselves.

- **A top-level shared-type name is a "fragment", and the fragment is the unit of ownership.** Each named top-level type (`body`, `meta`, `columns`, ...) is an independent slice of the document; features coordinate at fragment granularity.
- **The namespace is per kind.** Different kinds live in different documents (separate `fulcrum:doc:<id>` databases), so a name can never collide *across* kinds. The only real collision risk is two features writing the same name on the *same* kind, so reservations are scoped per kind.
- **Exactly one PRD owns a kind's layout.** The feature PRD that ships a kind's editor defines that kind's fragments. A later feature that needs to store something new on an existing kind claims a *new* fragment name; it never repurposes an existing one.
- **A PRD claims a fragment by registering it.** When a PRD lands it adds its kind's fragments to the reservation table below (name, Yjs type, meaning) as part of that change. A fragment that is not in the table is unclaimed and must not be written by shipping code.
- **A name's Yjs type is fixed for the life of the document.** Yjs binds a top-level name to the first accessor used on it; reading that name later through a different accessor is a bug. Once a fragment ships as, say, `getText("body")` it is a text fragment forever - migrating means a new name, not a re-typed one. For the same reason, never rename a shipped fragment: the old name still addresses the persisted data.
- **Naming:** lowerCamelCase, short, kind-local. Tests use ad-hoc placeholder names (`body`, `meta`, `cards`) to exercise the plumbing; those carry no schema guarantee until a PRD reserves them.

No fragments are reserved yet - each editor PRD fills in its kind's rows as it lands.

| Kind | Fragment | Yjs type | Meaning |
|---|---|---|---|
| _(none reserved yet)_ | | | |

### Registry schema (metadata index)

The registry stores *metadata about* documents, never content. One `RegistryEntry` (`src/documents/registry/entry.ts`) per document; all five fields are required and persisted.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Stable id, identical to the one passed to `openDocument` and the suffix of the content database `fulcrum:doc:<id>`. |
| `kind` | `DocumentKind` | The artifact kind. |
| `title` | string | Human-facing title shown in listings. |
| `createdAt` | number | Creation time, epoch ms. Immutable after `add`. |
| `lastEditedAt` | number | Last-edited time, epoch ms. Drives recency ordering. |

Edit-tracking contract:

- **`touch(id, at?)`** is the low-level "bump `lastEditedAt`" primitive.
- **`track(handle)`** is the ergonomic form: it subscribes to a document's own update stream and calls `touch` on genuine local edits, returning an unsubscribe. Updates y-indexeddb replays while *loading* a document are ignored, so merely opening a document is not an edit. No `Y.Doc` or provider crosses this seam - callers pass a handle.
- **Rename bumps recency.** `updateTitle` sets `lastEditedAt` too - a rename is a user-visible change, so a renamed document rises to the top of the listing.
- **Listing order** (`list()`): `lastEditedAt` descending, ties broken by `createdAt` descending then `id` - a stable, total order.

### The service is the only entry point

Feature code consumes the document layer exclusively through `openDocumentService()` (`src/documents/service`). It must not import the core or registry primitives, `openDocument`, `openRegistry`, Yjs, or y-indexeddb directly.

- `create` / `open` / `list` / `rename` / `remove` / `close` are the whole surface; `open` returns one cached handle per id (deduplication lives here, not in the core).
- Features read and mutate content through Yjs shared types on the returned `handle.doc`, following the fragment convention above; everything about *which* documents exist and their metadata flows through the service.
- Every method awaits the registry's local load (`whenReady`) and nothing awaits the network - the layer is local-first end to end. An unclean shutdown is recoverable: `src/documents/crash-reopen.test.ts` abandons a service and its handles without `close()`, then proves a completely fresh service over the same store restores the latest content and the full, recency-ordered registry listing.

## Editor core (Tiptap + Yjs fragment binding)

The shared rich-text layer every text surface uses (block file, card editor, speech doc) is one Tiptap editor bound to a named `XmlFragment` of a document-core `Y.Doc`.
`src/editor/core/` is that foundation only: a headless factory plus its baseline schema and Yjs binding.
Marks (bold / highlight / font-size), headings, the concrete extension preset, and the React editor component are deliberate follow-up tasks and live elsewhere.

- **The factory:** `createEditor({ binding: { handle, fragment }, extensions?, element? })` in `src/editor/core/editor-core.ts` returns a Tiptap `Editor`. Import from `src/editor/core`. `binding.handle` is a document-core `DocumentHandle`; `binding.fragment` is the top-level `XmlFragment` name on `handle.doc` (a non-empty fragment per the [Document model contract](#document-model-contract-shared-type-conventions) - the editor binds to `handle.doc.getXmlFragment(fragment)`, which fixes that name as an `XmlFragment` for the life of the document).
- **Tiptap v3 + `@tiptap/y-tiptap`:** the collaboration binding is `@tiptap/extension-collaboration`, which wraps `@tiptap/y-tiptap` (Tiptap's maintained fork of `y-prosemirror`, version-matched to `@tiptap/pm`). Chosen over hand-wiring `y-prosemirror` so Tiptap owns the ProseMirror sync/mapping/undo plugin lifecycle. Deps: `@tiptap/core`, `@tiptap/pm`, `@tiptap/extension-{document,paragraph,text,collaboration}`, `@tiptap/y-tiptap`, `y-protocols` (all under `dependencies`).
- **Baseline extension set (always included):** `Document`, `Paragraph`, `Text`, and `Collaboration.configure({ fragment })`. Caller `extensions` layer on top. **No `History`/StarterKit undo:** the Collaboration extension already installs the Yjs undo plugin, so undo/redo run through the shared Yjs history - a ProseMirror history extension would be a second, conflicting stack. Wiring undo keymaps/UI onto that Yjs history is a later undo task; do not add a `History` extension.
- **Headless, local-first:** no React component, no UI, no marks beyond the baseline schema, no collaboration provider / cursor / awareness layer (that is a later Sync PRD). Edits flow straight into the bound `XmlFragment`, so the existing document layer persists and reloads them. `createEditor` awaits nothing. A headless editor still needs a DOM element to mount to (Tiptap has no view otherwise): the factory mounts to a detached `document.createElement("div")` when no `element` is passed - enough for the full API under the Tauri webview or jsdom; the future React component passes its own mount. Always `editor.destroy()` when done to detach the ProseMirror plugins from the doc.
- **Tests:** `editor-core.test.ts` follows the established pattern - `fake-indexeddb/auto` + a fresh `IDBFactory()` per test, behavioral assertions on the editor's public API and resulting document JSON (never ProseMirror plugin internals). Key cases: an edit lands in the bound fragment; edits persist and reload through a genuinely fresh handle+editor; distinct fragment names are independent surfaces; two editors on the same document+fragment converge without any cursor layer. No test-environment shim beyond the existing Vitest+jsdom setup is needed - Tiptap uses only the jsdom DOM.

### Editor marks (bold + highlight)

`src/editor/marks/` holds the shared text marks layered on the editor core via `createEditor({ ..., extensions: [BoldMark, HighlightMark] })`. They are the first two marks; font-size and headings land separately.

- **Two independent marks, distinct axes.** `BoldMark` (`bold.ts`) is visual emphasis; `HighlightMark` (`highlight.ts`) marks the text a debater reads aloud. They are separate ProseMirror marks with separate names, so they toggle independently and compose on the same run, and render distinctly (`<strong>` vs `<mark>`).
- **Wrapped, not forked.** Each is a thin wrap of a Tiptap first-party extension (`@tiptap/extension-bold`, `@tiptap/extension-highlight`, both under `dependencies`) that only pins config and documents the schema. `HighlightMark` is configured `multicolor: false` - highlight is a boolean "read aloud" flag, so the schema stays attribute-free; per-run colors would be a future schema change (adding a `color` attribute), not an ad-hoc toggle.
- **Stable document-JSON schema (other tools depend on it).** Bold: mark name `bold` (`BOLD_MARK_NAME`), no attributes, JSON `{ "type": "bold" }`, HTML `<strong>`. Highlight: mark name `highlight` (`HIGHLIGHT_MARK_NAME`), no attributes, JSON `{ "type": "highlight" }`, HTML `<mark>` with no `data-color`. Treat the mark names and empty attribute sets as fixed - never rename or add attributes without a coordinated migration. Apply via the command API on a selection: `toggleBold`/`setBold`/`unsetBold`, `toggleHighlight`/`setHighlight`/`unsetHighlight`.
- **Tests:** `marks.test.ts` follows the editor-core pattern - `fake-indexeddb/auto` + fresh `IDBFactory()` per test, behavioral assertions on the command API and resulting document JSON/HTML (never ProseMirror internals). Key cases: each mark applies/removes on a selection; both compose on one run (JSON shows both); toggling one leaves the other; the composed run persists and reloads through a fresh handle+editor.

## Sharp edges

- **TypeScript build:** `build` type-checks `tsconfig.json` (app) and `tsconfig.node.json` (Vite config) as two plain `tsc -p ... --noEmit` passes rather than project references, because a composite referenced project may not disable emit (`tsc -b` errors TS6310/TS6306). Keep both `noEmit: true` and do not add `references`/`composite` back without switching the whole setup to solution-style configs.
- **Rust toolchain** must be on `PATH` for any `tauri` command: `source "$HOME/.cargo/env"` if `cargo` is missing.
- **App icons:** `src-tauri/app-icon.svg` is the source of truth. Regenerate the desktop icon set with `npm run tauri icon src-tauri/app-icon.svg` (or a 1024x1024 PNG). The generator also emits iOS/Android/Windows-Store assets; this is a desktop-only app, so keep only `src-tauri/icons/{32x32,64x64,128x128,128x128@2x}.png`, `icon.icns`, `icon.ico`, `icon.png`.
- **CSP:** `tauri.conf.json` enforces `default-src 'self'`. Inline scripts and styles are blocked, and all external resource loads are blocked. Any future feature that loads fonts, external images, or eval-based code must add an explicit CSP directive rather than loosening the policy wholesale.

## Design tokens

All tokens are defined in `src/index.css` inside the Tailwind v4 `@theme` block.
Use these named tokens instead of raw Tailwind palette utilities.

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

### Typography

No custom type scale; use Tailwind's built-in `text-xs` through `text-4xl` with the system sans-serif stack.
Standard choices: `text-4xl font-semibold` for page titles, `text-sm` for labels, `text-xs uppercase tracking-widest` for chips.

## CI

`.github/workflows/ci.yml` runs two parallel jobs on pull requests and pushes to `main`:
- **lint-and-test** - ESLint + Vitest on `ubuntu-latest` (Node only, fast).
- **tauri-build** - `npm run tauri build` on `macos-latest` (smoke-tests the full desktop bundle compile).
  Uses `dtolnay/rust-toolchain@stable` + `swatinem/rust-cache` (keyed to `src-tauri`) and `setup-node` npm cache.
  No code signing or artifact publishing; build failure fails CI.
