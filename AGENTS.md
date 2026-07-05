# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Stack (fixed by the product owner)

- **Tauri v2** - native desktop shell (Rust), config in `src-tauri/`.
- **React + TypeScript + Vite** - front end in `src/`.
- **Tailwind CSS v4** - via the `@tailwindcss/vite` plugin; global styles are `@import "tailwindcss";` in `src/index.css` (no `tailwind.config.js`, no PostCSS config).
- **react-router-dom v7** - client-side routing for the app frame. Uses `HashRouter` (see `src/App.tsx`) because the app is served from a `file://` context under Tauri with no server to resolve real paths.
- **Tiptap v3** - shared rich-text editor layer in `src/editor/`: a headless factory + Yjs binding (`core/`), bold/highlight/font-size marks (`marks/`), headings + outline (`headings/`), the canonical `editorPreset` that composes them (`preset.ts`), and the `DocumentEditor` React primitive (`react/`). Feature editors consume the preset + primitive, not the pieces directly.
- **Yjs + y-indexeddb** - shared data types and local persistence, used by the document and editor layers.
- **XYFlow (`@xyflow/react` v12)** - the flow-sheet canvas in `src/flow/canvas/`: a pannable node surface that renders speech columns (and, later, flow nodes). Added by the canvas task; see [Flow sheet canvas](#flow-sheet-canvas-xyflow).

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

Each editor/feature PRD fills in its kind's rows as it lands.

| Kind | Fragment | Yjs type | Meaning |
|---|---|---|---|
| `flow-sheet` | `columns` | `Y.Array<Y.Map>` | Ordered speech columns; each map is one `SpeechColumn` (`id`, `label`, `side`). See [Flow sheet column model](#flow-sheet-column-model). |

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

## Shared editor layer (the contract)

This is the entry-point contract for every text surface a debater touches (block file, card editor, speech doc).
Feature editors consume exactly two things from `src/editor/`: the **`editorPreset`** (the agreed extension bundle) and the **`DocumentEditor`** React primitive (the editable surface).
They do not re-list marks, re-wire the Yjs binding, or reach past the preset - the sections after this one are the implementation substrate; this section is the agreement the substrate upholds.

- **The preset is the single entry point.** `editorPreset(options?)` (`src/editor/preset.ts`) returns the shared extension list a feature hands to `createEditor` (or, transitively, to `DocumentEditor`). It composes bold + highlight + font-size + headings so no feature can drift on *which* shared marks it enables. `options` are the feature-specific seams: `extensions` (extra Tiptap extensions layered after the shared set) and `headingLevels` (a subset of 1-6 to offer; empty/omitted means the full range). The preset does **not** include the baseline (`Document`/`Paragraph`/`Text`/`Collaboration`) - `createEditor` always installs that - so the preset is exactly the shared *formatting* layer.
- **The React primitive is the surface.** `DocumentEditor` (`src/editor/react/`, built on `@tiptap/react`) takes a document-core `DocumentHandle` + `fragment` name (plus optional `preset` config and `@tiptap/react`-style `deps`), creates an editor through the preset, renders an editable `EditorContent`, and destroys the editor on unmount. `useDocumentEditor` is the underlying hook for callers that need the raw `Editor` (e.g. to drive a toolbar). Both render their container synchronously and only mount the ProseMirror view once the handle's **local** load resolves (`handle.whenLoaded`) - waiting on IndexedDB, never the network - so the primitive keeps the local-first boot rule. The primitive ships no toolbar, menus, keymaps, or feature chrome; features compose those around it.
- **Fragment naming.** Content lives under a top-level `XmlFragment` name on `handle.doc` (the [Document model contract](#document-model-contract-shared-type-conventions) fragment convention). The name is non-empty, lowerCamelCase, kind-local, and fixed for the life of the document - never re-typed or renamed. Distinct names on one document are independent surfaces; the same name on the same document is the same surface (two editors on it converge).
- **Mark schemas are stable contracts (other tools read them).** Bold: mark name `bold` (`BOLD_MARK_NAME`), no attributes, HTML `<strong>`. Highlight: mark name `highlight` (`HIGHLIGHT_MARK_NAME`), no attributes (single-color, `multicolor: false`), HTML `<mark>`. Font size: the `textStyle` mark carrying a `fontSize` attribute (e.g. `{ type: "textStyle", attrs: { fontSize: "11pt" } }`) drawn from the discrete `FONT_SIZE_SCALE`. Never rename a mark or add/remove attributes without a coordinated migration.
- **Heading schema + ToC query.** A heading serializes as `{ type: "heading", attrs: { level }, content: [...] }` over the full 1-6 range (`HEADING_LEVELS`). `getOutline(editor)` derives an ordered `OutlineHeading[]` (`{ level, text, pos }`) from `editor.state.doc`, and `observeOutline(editor, listener)` is the live seam a ToC panel subscribes to. The heading JSON shape is what any ToC generator reads; it is fixed per the fragment convention.
- **Yjs owns undo - no history extension.** Neither the preset nor a feature adds a `History`/StarterKit undo extension. The baseline `Collaboration` binding already installs the Yjs undo plugin, so undo/redo run through the shared Yjs history; a ProseMirror history extension would be a second, conflicting stack. Wiring undo keymaps/UI onto the Yjs history is a later undo task.
- **Tests:** `preset.test.ts` asserts the preset wires all four capabilities into one editor and that `headingLevels` narrows the offered range; `react/editor-react.test.tsx` renders `DocumentEditor` over a real handle (`fake-indexeddb/auto` + fresh `IDBFactory()` per test), asserts an editable ProseMirror surface mounts after the local load, and proves React-driven edits (including a preset mark) persist and reload through a genuinely fresh handle. Assertions stay behavioral (document JSON / persisted state), never contentEditable pixels - jsdom's contentEditable is inert.

## Editor core (Tiptap + Yjs fragment binding)

The shared rich-text layer every text surface uses (block file, card editor, speech doc) is one Tiptap editor bound to a named `XmlFragment` of a document-core `Y.Doc`.
`src/editor/core/` is that foundation only: a headless factory plus its baseline schema and Yjs binding.
The marks, headings, preset, and React primitive that build on it are documented in [Shared editor layer](#shared-editor-layer-the-contract) above and detailed in the subsections below.

- **The factory:** `createEditor({ binding: { handle, fragment }, extensions?, element? })` in `src/editor/core/editor-core.ts` returns a Tiptap `Editor`. Import from `src/editor/core`. `binding.handle` is a document-core `DocumentHandle`; `binding.fragment` is the top-level `XmlFragment` name on `handle.doc` (a non-empty fragment per the [Document model contract](#document-model-contract-shared-type-conventions) - the editor binds to `handle.doc.getXmlFragment(fragment)`, which fixes that name as an `XmlFragment` for the life of the document).
- **Tiptap v3 + `@tiptap/y-tiptap`:** the collaboration binding is `@tiptap/extension-collaboration`, which wraps `@tiptap/y-tiptap` (Tiptap's maintained fork of `y-prosemirror`, version-matched to `@tiptap/pm`). Chosen over hand-wiring `y-prosemirror` so Tiptap owns the ProseMirror sync/mapping/undo plugin lifecycle. Deps: `@tiptap/core`, `@tiptap/pm`, `@tiptap/extension-{document,paragraph,text,collaboration}`, `@tiptap/y-tiptap`, `y-protocols` (all under `dependencies`).
- **Baseline extension set (always included):** `Document`, `Paragraph`, `Text`, and `Collaboration.configure({ fragment })`. Caller `extensions` layer on top. **No `History`/StarterKit undo:** the Collaboration extension already installs the Yjs undo plugin, so undo/redo run through the shared Yjs history - a ProseMirror history extension would be a second, conflicting stack. Wiring undo keymaps/UI onto that Yjs history is a later undo task; do not add a `History` extension.
- **Headless, local-first:** no React component, no UI, no marks beyond the baseline schema, no collaboration provider / cursor / awareness layer (that is a later Sync PRD). Edits flow straight into the bound `XmlFragment`, so the existing document layer persists and reloads them. `createEditor` awaits nothing. A headless editor still needs a DOM element to mount to (Tiptap has no view otherwise): the factory mounts to a detached `document.createElement("div")` when no `element` is passed - enough for the full API under the Tauri webview or jsdom; the `DocumentEditor` React primitive passes its own mount via `@tiptap/react`'s `EditorContent`. Always `editor.destroy()` when done to detach the ProseMirror plugins from the doc.
- **Tests:** `editor-core.test.ts` follows the established pattern - `fake-indexeddb/auto` + a fresh `IDBFactory()` per test, behavioral assertions on the editor's public API and resulting document JSON (never ProseMirror plugin internals). Key cases: an edit lands in the bound fragment; edits persist and reload through a genuinely fresh handle+editor; distinct fragment names are independent surfaces; two editors on the same document+fragment converge without any cursor layer. No test-environment shim beyond the existing Vitest+jsdom setup is needed - Tiptap uses only the jsdom DOM.

### Editor marks (bold + highlight)

`src/editor/marks/` holds the shared text marks layered on the editor core via `createEditor({ ..., extensions: [BoldMark, HighlightMark] })`. They are the first two marks; font-size and headings land separately.

- **Two independent marks, distinct axes.** `BoldMark` (`bold.ts`) is visual emphasis; `HighlightMark` (`highlight.ts`) marks the text a debater reads aloud. They are separate ProseMirror marks with separate names, so they toggle independently and compose on the same run, and render distinctly (`<strong>` vs `<mark>`).
- **Wrapped, not forked.** Each is a thin wrap of a Tiptap first-party extension (`@tiptap/extension-bold`, `@tiptap/extension-highlight`, both under `dependencies`) that only pins config and documents the schema. `HighlightMark` is configured `multicolor: false` - highlight is a boolean "read aloud" flag, so the schema stays attribute-free; per-run colors would be a future schema change (adding a `color` attribute), not an ad-hoc toggle.
- **Stable document-JSON schema (other tools depend on it).** Bold: mark name `bold` (`BOLD_MARK_NAME`), no attributes, JSON `{ "type": "bold" }`, HTML `<strong>`. Highlight: mark name `highlight` (`HIGHLIGHT_MARK_NAME`), no attributes, JSON `{ "type": "highlight" }`, HTML `<mark>` with no `data-color`. Treat the mark names and empty attribute sets as fixed - never rename or add attributes without a coordinated migration. Apply via the command API on a selection: `toggleBold`/`setBold`/`unsetBold`, `toggleHighlight`/`setHighlight`/`unsetHighlight`.
- **Tests:** `marks.test.ts` follows the editor-core pattern - `fake-indexeddb/auto` + fresh `IDBFactory()` per test, behavioral assertions on the command API and resulting document JSON/HTML (never ProseMirror internals). Key cases: each mark applies/removes on a selection; both compose on one run (JSON shows both); toggling one leaves the other; the composed run persists and reloads through a fresh handle+editor.

## Editor marks: font size (addressable, queryable)

Font size is a **real document mark**, never a bare inline style, because the product's formatting tools operate on it programmatically: the card-cutting **Shrink** tool and the formatting standards read the size(s) on a selection and cycle selections through a known scale, so size must be *addressable* document data.
`src/editor/marks/font-size.ts` is that mark plus the helpers those tools consume; import from `src/editor/marks`.
Bold / highlight are genuinely separate marks (`bold`, `highlight`) built in parallel; font size deliberately owns `textStyle` so there is no collision.

- **Substrate - upstream `textStyle` + `fontSize`, not a bespoke mark:** built on `@tiptap/extension-text-style`'s `TextStyle` mark and its `FontSize` attribute extension (dep `@tiptap/extension-text-style`, under `dependencies`). A size surfaces in the document JSON as `marks: [{ type: "textStyle", attrs: { fontSize: "11pt" } }]` - the tools read `attrs.fontSize` off the model, never by scraping rendered CSS. `textStyle` is Tiptap's canonical run-styling carrier (font family, color, ... share it), so owning `fontSize` there keeps one addressable typography mark. Install via the exported `fontSizeExtensions` array (`[TextStyle, FontSize]`, order matters): `createEditor({ binding, extensions: fontSizeExtensions })`.
- **The scale is the single source of truth:** `FONT_SIZE_SCALE` (ascending CSS point strings, `"8pt"`..`"14pt"`) is the *only* place sizes are defined; every helper derives from it. Sizes are a discrete scale, not arbitrary floats, because the standards tooling cycles a known set of steps. `DEFAULT_FONT_SIZE` (`"11pt"`, a scale member) is the size an unset run is anchored to when stepping. `UNSET_FONT_SIZE` (`null`) is the value used for default-size (no-mark) text.
- **Helpers (the tool-facing surface):**
  - `setFontSize(editor, size)` / `unsetFontSize(editor)` - set an addressable size (throws if `size` is off-scale, so no float sneaks past the discrete scale) or clear back to default. On a collapsed cursor they set/clear the stored mark.
  - `readFontSizes(editor)` - returns *every* distinct size present in the selection, ordered smallest-first with the unset/default run (if any) first as `null`. Never collapses a mixed selection to one "winner". Off-scale (pasted) sizes are reported verbatim - reading is faithful, only stepping normalizes.
  - `stepFontSizes(editor, direction, { wrap })` plus `increaseFontSize` / `decreaseFontSize` / `cycleFontSize` - move the selection one step through the scale. `cycleFontSize` wraps largest->smallest.
- **Mixed-selection contract (documented + tested):** *read* reports all sizes present (see above). *Step* normalizes **each run independently** - every run moves one step from its own current position, so relative size tiers are preserved (a large-highlight-over-small-body card stays two-tier as the whole selection shrinks/grows). Unset runs anchor at `DEFAULT_FONT_SIZE` before stepping; off-scale sizes snap to their nearest scale step first; clamped stepping is a no-op at the extremes (returns `false`), `wrap` cycles. Runs are re-selected and stepped in one chained transaction, then the original selection is restored.
- **Tests:** `font-size.test.ts` follows the established pattern - `fake-indexeddb/auto` + fresh `IDBFactory()` per test, behavioral assertions on the helpers and the resulting document JSON (a size is asserted as a `textStyle`/`fontSize` mark; adjacent same-size text merges to one text node). Key cases: set writes an addressable mark and persists/reloads through a fresh handle; read covers unset, uniform, and mixed (ordering) selections and a collapsed cursor; step covers increase/decrease, unset-anchoring, clamp, cycle-wrap, per-run mixed stepping, and cursor stored-mark stepping.

## Editor headings + outline (ToC seam)

Debate documents lean on heading structure - a speech doc's table of contents is generated straight from its headings - so the heading node and the query that turns it into an outline live together in `src/editor/headings/`, scoped away from the marks other tasks add under `src/editor/`.
This is the schema + query seam only: no ToC UI and no React.

- **Heading extension:** `heading` in `src/editor/headings/heading-extension.ts` is `Heading.configure({ levels: 1..6 })` (`@tiptap/extension-heading`, a `dependencies` addition). Import from `src/editor/headings`. The editor-core baseline deliberately omits it, so heading support is opt-in: layer it onto `createEditor`'s `extensions`. Standard Tiptap commands then work - `setHeading({ level })`, `toggleHeading({ level })`, `setParagraph()`.
- **Full 1-6 range, justified:** we support the whole HTML heading range rather than a curated subset. It matches ProseMirror's default heading node and HTML's semantic ceiling (no arbitrary Fulcrum limit), debate structure genuinely nests that deep (position -> contention -> subpoint -> card tag -> analytic), and since `level` is a persisted node attribute, starting at the natural maximum avoids a later widening that would leave old and new documents inconsistent. `HEADING_LEVELS` is the runtime tuple, `HeadingLevel` the type, `isHeadingLevel` the guard.
- **Schema shape is the contract:** a heading serializes as `{ type: "heading", attrs: { level }, content: [...] }`. That shape is what the outline and any ToC generator read; it is asserted by `outline.test.ts`. Per the fragment convention it is fixed for the life of a document.
- **Outline query (`src/editor/headings/outline.ts`):** `getOutline(editor)` returns `OutlineHeading[]` (`{ level, text, pos }`) in document order - a **pure derivation of `editor.state.doc`**, no ProseMirror plugin and no cached/plugin-stateful outline. `text` is `node.textContent` (inline marks flattened to a plain ToC label). `pos` is the ProseMirror position immediately before the heading node, valid only against the document version it was read from (an outline is a snapshot); to act on one, drive the same editor, e.g. `editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()` (`pos + 1` lands inside the heading). `outlineFromDoc(node)` is the shared walker for callers already holding a ProseMirror doc node.
- **Live seam a ToC panel consumes:** `observeOutline(editor, listener)` fires the listener immediately with the current outline and again after every document change (`editor.on("update")` filtered to `transaction.docChanged`, so cursor-only moves do not re-fire), returning an unsubscribe. It re-derives via `getOutline` each time, so the panel never manages invalidation.
- **Tests:** `outline.test.ts` follows the established pattern (`fake-indexeddb/auto` + fresh `IDBFactory()` per test, behavioral). Key cases: every 1-6 level applies via the API; the JSON heading shape is asserted; the outline is ordered with real ascending positions (and `pos + 1` selects into the heading); marks flatten to plain text; `observeOutline` reflects add/edit/remove and stops after unsubscribe; a selection-only change does not re-fire; the outline survives a reload through a fresh handle.

## Flow sheet column model

The flow sheet is the canvas a debater flows a round on, and its spine is an ordered list of **speech columns** - one per speech.
`src/flow/` is that data substrate only: the Yjs shared-type layout for the columns plus the CRUD + observe helpers.
No UI, no React, no XYFlow, and no flow-node content (contentions/subpoints are later PRDs) - just stable columns for those PRDs to attach nodes to.

- **Fragment:** columns live in the `columns` top-level `Y.Array<Y.Map>` on a `flow-sheet` document's `Y.Doc` (`FLOW_COLUMNS_FRAGMENT`), reserved in the fragment table above. Each entry is a nested `Y.Map` with `id`, `label`, `side`. A later flow-node PRD claims a *new* fragment; it never repurposes `columns`, and `columns` is bound to `Y.Array` for the life of the document.
- **`SpeechColumn` = `{ id, label, side }`** (`src/flow/columns.ts`). `side` is `FlowSide` (`"aff" | "neg"`, guarded by `isFlowSide`, matching the `aff`/`neg` design tokens). The returned columns are plain snapshots, not live Yjs maps.
- **Column id is the stable foreign key.** `addColumn` mints it with `crypto.randomUUID`; it is immutable for the column's life, preserved across relabel/reorder/reload, and retired permanently on remove. Later flow nodes reference columns by this id, so never reuse or fabricate one outside `addColumn`.
- **Helpers (the whole surface, import from `src/flow`):** `listColumns(handle)` / `getColumn(handle, id)` read ordered snapshots; `addColumn(handle, {side, label})` appends and returns the new column; `relabelColumn(handle, id, label)` (throws on unknown id); `moveColumn(handle, id, toIndex)` reorders (clamps `toIndex`, throws on unknown id, no-op if already there); `removeColumn(handle, id)` (no-op on unknown id). All take a document-core `DocumentHandle` and mutate shared types on `handle.doc` in one transaction each, so changes persist to IndexedDB and flow through the doc's `update` stream (a registry that `track`s the handle bumps last-edited automatically - this layer never touches the registry).
- **Yjs cannot re-position an integrated `Y.Map`,** so `moveColumn` rebuilds the moved column (same id/label/side) at the new index inside one transaction rather than moving the map instance.
- **Observe seam:** `observeColumns(handle, listener)` fires immediately with the current ordered snapshot and again after every column change (add/relabel/reorder/remove), returning an unsubscribe. It mirrors the headings `observeOutline` style - a pure derivation of state (`listColumns`) via `observeDeep` on the `columns` array, so a relabel inside a nested map fires too, and changes to other fragments do not. This is the seam the upcoming canvas consumes.
- **Tests:** `columns.test.ts` follows the established pattern - `fake-indexeddb/auto` + fresh `IDBFactory()` per test, behavioral assertions on the helpers and persisted state only (never Yjs internals). Key cases: add/relabel/move (forward, backward, clamp, id-preserving)/remove; a full edit sequence persists and reloads through a genuinely fresh handle with stable ids; `observeColumns` fires once per mutation and stops after unsubscribe.

## Flow sheet canvas (XYFlow)

The canvas is the visual surface a debater flows a round on: it renders the [flow-sheet column model](#flow-sheet-column-model) as an XYFlow (`@xyflow/react` v12, a `dependencies` addition) node graph - one full-height, side-coloured column per speech column, in document order, pannable horizontally across more columns than fit.
`src/flow/canvas/` is the render-only surface plus the live column->node seam.
It ships **no column-editing UI** (add/label/reorder controls are a later task) and **no flow-node content or node-container API** (a later PRD establishes that contract on top of the column-node seam here).

- **`FlowCanvas` is the entry point** (`FlowCanvas.tsx`, import from `src/flow/canvas`): give it a flow-sheet `DocumentHandle` (or `null` while opening) and it renders a `<ReactFlow>` surface. Columns are populated live via the model's `observeColumns`, so nothing here awaits a network resource - it paints synchronously and fills in columns once IndexedDB has loaded into the doc (the local-first boot rule). It measures its own viewport height with a `ResizeObserver` purely so columns render full-height; measurement never gates when columns appear.
- **Horizontal-only navigation:** `panOnScrollMode={Horizontal}`, zoom locked (`minZoom=maxZoom=1`) so column heights stay 1:1 with the viewport, and `translateExtent` pins the vertical axis to 0 so full-height columns always fill the viewport top-to-bottom. `nodesDraggable`/`nodesConnectable`/`elementsSelectable` are all off - render-only.
- **Two-layer split for testability (the key structural decision):** XYFlow measures the DOM, which does not run under jsdom, so the column->node translation is a **pure** function (`column-nodes.ts`: `columnsToNodes`, `columnX`, `columnsContentWidth`, layout constants `COLUMN_WIDTH`/`COLUMN_GAP`/`DEFAULT_COLUMN_HEIGHT`) kept separate from the `<ReactFlow>` wiring. Each column maps to one `speechColumn` node (`SPEECH_COLUMN_NODE_TYPE`) at `x = index*(COLUMN_WIDTH+COLUMN_GAP)`, `y=0`; the **column id becomes the node id** (the foreign key later flow nodes reference by `parentId`). `useColumnNodes(handle, height?)` is the live hook wiring `observeColumns` -> `columnsToNodes`.
- **Column node = a container seam:** `SpeechColumnNode.tsx` renders a labelled header + an empty `data-column-body` region - the deliberate seam where the upcoming node-container task mounts flow nodes (XYFlow child nodes parented to the column). Side colouring is **design-token classes only** (`bg-aff-soft`/`border-aff-strong`, `bg-neg-soft`/`border-neg-strong`), never raw hex in the component, keyed off `data.side`.
- **Tests:** the pure mapping (`column-nodes.test.ts`) and the node component (`SpeechColumnNode.test.tsx`, asserting side-token classes behaviorally) are tested in isolation; `canvas.test.tsx` drives `useColumnNodes` and a rendered `FlowCanvas` over a *real* flow-sheet handle (`fake-indexeddb/auto` + fresh `IDBFactory()`), asserting live reaction to add/relabel/reorder/remove and per-column side classes - never pixels or XYFlow internals. XYFlow *does* render its custom nodes under jsdom (all nodes mount with `onlyRenderVisibleElements={false}`), so the rendered-canvas assertions hold; the "wider than viewport" pan property is asserted via `columnsContentWidth` exceeding a representative viewport rather than by measuring.
- **jsdom needs a `ResizeObserver`:** `src/test/setup.ts` installs a no-op `ResizeObserver` stub (jsdom ships none) so XYFlow and `FlowCanvas` mount without throwing. It never fires; canvas tests assert structure, not measured size.

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
