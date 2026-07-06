# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Stack (fixed by the product owner)

- **Tauri v2** - native desktop shell (Rust), config in `src-tauri/`.
- **React + TypeScript + Vite** - front end in `src/`.
- **Tailwind CSS v4** - via the `@tailwindcss/vite` plugin; global styles are `@import "tailwindcss";` in `src/index.css` (no `tailwind.config.js`, no PostCSS config).
- **react-router-dom v7** - client-side routing for the app frame. Uses `HashRouter` (see `src/App.tsx`) because the app is served from a `file://` context under Tauri with no server to resolve real paths.
- **Tiptap v3** - shared rich-text editor layer in `src/editor/`: a headless factory + Yjs binding (`core/`), bold/highlight/font-size marks (`marks/`), headings + outline (`headings/`), the canonical `editorPreset` that composes them (`preset.ts`), and the `DocumentEditor` React primitive (`react/`). Feature editors consume the preset + primitive, not the pieces directly.
- **Yjs + y-indexeddb** - shared data types and local persistence, used by the document and editor layers.
- **XYFlow (`@xyflow/react` v12)** - the flow-sheet canvas in `src/flow/canvas/`: a pannable node surface that renders speech columns and hosts flow nodes. See [Flow sheet (the contract)](#flow-sheet-the-contract).

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
| `flow-sheet` | `columns` | `Y.Array<Y.Map>` | Ordered speech columns; each map is one `SpeechColumn` (`id`, `label`, `side`). See [Column model](#column-model-the-spine). |
| `flow-sheet` | `nodes` | `Y.Map<Y.Map>` | Flow nodes keyed by id; each map records `columnId` (membership), `kind`, and `order` (vertical). See [Node-container contract](#node-container-contract-membership--vertical-order). |
| `block-file` | `body` | `Y.XmlFragment` | The one continuous rich-text surface, whose top-level content is exactly two enforced side sections (aff then neg). `BLOCK_FILE_FRAGMENT` in `src/blockfile`. See [Block file (the contract)](#block-file-the-contract). |

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
- **Heading schema + ToC query.** A heading serializes as `{ type: "heading", attrs: { level }, content: [...] }` over the full 1-6 range (`HEADING_LEVELS`). `getOutline(editor)` derives an ordered `OutlineHeading[]` (`{ level, text, pos }`) from `editor.state.doc`, `observeOutline(editor, listener)` is the live seam a ToC panel subscribes to, and `buildOutlineTree(headings)` converts the flat list into a nested `OutlineTreeNode[]` forest for rendering hierarchy. The heading JSON shape is what any ToC generator reads; it is fixed per the fragment convention.
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
- **Outline-to-tree derivation (`src/editor/headings/outline-tree.ts`):** `buildOutlineTree(headings)` turns the flat `OutlineHeading[]` into a forest of `OutlineTreeNode` (`OutlineHeading` + `children`), so a ToC panel renders hierarchy without re-deriving it. It is a **pure function of the array** - no editor/ProseMirror in its signature - and carries `level`/`text`/`pos` through verbatim. Nesting rule: each heading nests under the nearest preceding heading of a *strictly shallower* level (stack-based); a heading with no such ancestor is a root, so consecutive same-level headings are siblings and a document opening on a deep heading yields it as a root (nothing dropped). It does not mutate its input (each node is a fresh spread). This is the derivation the rest of the ToC-sidebar work builds on.
- **Tests:** `outline.test.ts` follows the established pattern (`fake-indexeddb/auto` + fresh `IDBFactory()` per test, behavioral). Key cases: every 1-6 level applies via the API; the JSON heading shape is asserted; the outline is ordered with real ascending positions (and `pos + 1` selects into the heading); marks flatten to plain text; `observeOutline` reflects add/edit/remove and stops after unsubscribe; a selection-only change does not re-fire; the outline survives a reload through a fresh handle. `outline-tree.test.ts` is a pure unit test (no editor, no IndexedDB). Key cases: strict-nesting rule (each heading under the nearest shallower ancestor); same-level headings are siblings; a deep heading with no shallower ancestor is a root; empty input yields an empty array; `level`/`text`/`pos` are carried through verbatim; input array is not mutated.

## Flow sheet (the contract)

This is the consolidated contract for the flow-sheet feature - the surface every later flow-node PRD (contentions, subpoints, argument rows, the RFD, timers) builds on without reading the code history.
The flow sheet is the canvas a debater flows a round on: an ordered row of **speech columns** (one per speech), each hosting **flow nodes** stacked vertically.
The whole feature spans three module groups, layered strictly bottom-up:

- **`src/flow/`** - the data substrate: the Yjs shared-type layout plus CRUD + observe helpers for the [column model](#column-model-the-spine) (`columns.ts`) and the [node-container model](#node-container-contract-membership--vertical-order) (`nodes.ts`). No UI, no React, no XYFlow. Import the whole model surface from `src/flow`.
- **`src/flow/canvas/`** - the [XYFlow canvas](#the-canvas-xyflow): the render surface (`FlowCanvas`), the column-management write strip (`ColumnControls`), the composited editable panel (`FlowSheetPanel`), and the pure model->node mappings + live hooks behind them. Import from `src/flow/canvas`.
- **`src/rounds/`** - the [round lifecycle](#round-lifecycle-a-round-is-a-flow-sheet-document) seam: a round *is* a flow-sheet document, so this is a thin map onto the document layer, plus the shell routing onto it.

What the scaffold ships is exactly the contract and its plumbing: stable columns, the node membership/ordering model, the registration seam that hosts a node kind, and the round mapping.
It deliberately ships **no real node kinds** (contentions/subpoints/argument rows are their own PRDs), **no drag-and-drop** (reorder is button-driven), and no timer/RFD.
When this contract and an implementation note disagree, the contract is the intent and the code is a bug.

### The flow-sheet document (fragment schema)

A flow sheet is one `flow-sheet` [document](#document-model-contract-shared-type-conventions): a `Y.Doc` persisted per-id to IndexedDB, reached through `openDocumentService()` like any other document.
Its content lives in two reserved top-level fragments on that doc, each owned by this feature and bound to its Yjs type for the life of the document (never re-typed, never renamed - the [fragment convention](#where-a-kinds-content-lives-fragment-convention)):

| Fragment | Yjs type | Constant | Holds |
|---|---|---|---|
| `columns` | `Y.Array<Y.Map>` | `FLOW_COLUMNS_FRAGMENT` | Ordered speech columns; each nested map is one `SpeechColumn` (`id`, `label`, `side`). |
| `nodes` | `Y.Map<Y.Map>` | `FLOW_NODES_FRAGMENT` | Flow nodes keyed by id; each nested map records `id`, `columnId`, `kind`, `order`. |

A later flow-node PRD that needs to store node *content* claims a **new** fragment (or an owned nested slot on the node) - it never repurposes `columns` or `nodes`.
Both fragments are mutated only through the `src/flow` helpers, each of which writes in a single `doc.transact` so observers never see a half-built entry, persists to IndexedDB, and flows through the doc's `update` stream (a registry that `track`s the handle bumps last-edited automatically - this layer never touches the registry, and nothing here awaits the network).

### Column model (the spine)

- **`SpeechColumn = { id, label, side }`** (`src/flow/columns.ts`). `side` is `FlowSide` (`"aff" | "neg"`, runtime list `FLOW_SIDES`, guarded by `isFlowSide`), matching the `aff`/`neg` design tokens (see [Side colouring](#side-colouring)). Returned columns are plain snapshots, not live Yjs maps.
- **Column id is the stable foreign key.** `addColumn` mints it with `crypto.randomUUID`; it is immutable for the column's life, preserved across relabel/reorder/reload, and retired permanently on remove. Flow nodes reference their column by this id, so never reuse or fabricate one outside `addColumn`.
- **Helpers (import from `src/flow`):** `listColumns(handle)` / `getColumn(handle, id)` read ordered snapshots; `addColumn(handle, {side, label})` appends and returns the new column; `relabelColumn(handle, id, label)` (throws on unknown id); `moveColumn(handle, id, toIndex)` reorders (clamps `toIndex`, throws on unknown id, no-op if already there); `removeColumn(handle, id)` (no-op on unknown id).
- **Reorder rebuilds, it does not move.** Yjs cannot re-position an integrated `Y.Map`, so `moveColumn` rebuilds the moved column (same id/label/side) at the new index inside one transaction. This is safe *because a column carries only primitive fields* - contrast the node model, which cannot afford a rebuild (see below).
- **Observe seam:** `observeColumns(handle, listener)` fires immediately with the current ordered snapshot and again after every column change (add/relabel/reorder/remove), returning an unsubscribe. It is a pure derivation of state (`listColumns`) via `observeDeep` on the `columns` array - a relabel inside a nested map fires too, and changes to other fragments do not. This is the seam both the canvas and the write strip consume, so they always agree on the column list.

### Side colouring

A column's `side` drives its colour, and colour comes **only** from the debate-side design tokens - never raw hex in a component:

| `side` | Background | Border |
|---|---|---|
| `"aff"` | `bg-aff-soft` | `border-aff-strong` |
| `"neg"` | `bg-neg-soft` | `border-neg-strong` |

The token values live in the [Debate side colors](#debate-side-colors) table (the single source of truth); a component keys the class off `data.side` and never hard-codes a value.

### Node-container contract (membership + vertical order)

A flow node records **which column it belongs to** and **where it sits vertically** - nothing about its content.
This is the stable seam node-kind PRDs build on, held in the flow doc (never in transient XYFlow state) so it survives reload.

- **Model - content-free (`src/flow/nodes.ts`):** each node is a nested `Y.Map` under the `nodes` fragment with `id`, `columnId`, `kind`, `order`. The public snapshot `FlowNode = { id, columnId, kind }` deliberately omits `order` - it is an internal sequencing detail, and callers get a node's vertical position from its index in `listColumnNodes`. A node's actual *content* (what a "contention" contains) is each kind's PRD to define and store elsewhere, so this contract stays fixed as node kinds proliferate.
- **Membership** is the `columnId` foreign key (a `SpeechColumn.id`). A node whose column is gone is an *orphan*: this layer never cascades a column removal (that lifecycle choice belongs to the consuming feature), and the canvas simply does not render an orphan.
- **Vertical order** is the ascending `order` field, tie-broken by id for a stable total order.
- **Keyed `Y.Map`, not a `Y.Array` (the key design choice):** columns use a `Y.Array` and *rebuild* a map on reorder, which is fine for primitive fields but would destroy the rich content a node kind attaches. Keying `nodes` by id and expressing order in a plain `order` field means `moveNode` only rewrites primitive `order` values - the node's identity and attached content stay put.
- **Helpers (import from `src/flow`):** `listNodes(handle)` (every node, stable total order by column then vertical then id), `listColumnNodes(handle, columnId)` (one column's nodes in vertical order - the index *is* the vertical position), `getNode`, `addNode(handle, {columnId, kind})` (mints id, appends to the column bottom), `moveNode(handle, id, toIndex)` (reorder within its column; clamps `toIndex`, throws on unknown id, no-op if unchanged; renumbers primitives only), `removeNode` (no-op on unknown id), `observeNodes(handle, listener)` (fires immediately then on every add/move/membership/remove; `observeDeep`, so a reorder inside a nested map fires; other fragments do not).
- **Hosting seam - XYFlow parent/child, model-authoritative:** a registered kind renders as an XYFlow **child node** parented to its column node (`parentId` = the column id, `extent: "parent"` so it is clipped to the column's bounds), positioned by the flow-doc order - never by transient XYFlow state. The column id is the column node's XYFlow id, so `columnId` flows straight to `parentId`. Child y-offset is a pure function of vertical rank (`flowNodeY`), needing no DOM measurement because child coordinates are column-relative.
- **Registration API (extensible without touching the canvas):** a PRD adds a node kind by passing a `FlowNodeRegistry` (a list of `FlowNodeTypeDefinition = { kind, component, height? }`) to `FlowCanvas`'s `flowNodeTypes` prop. The canvas builds its XYFlow `nodeTypes` (`registryToNodeTypes`) and its hosted child nodes (`flowNodesToNodes` via `useFlowNodes`, which observes both nodes and columns) straight from that registry - it never enumerates kinds itself. A node whose `kind` has no registered definition is **skipped** (no renderer), so an unknown/orphaned/legacy node degrades gracefully. The component receives `FlowNodeData = { flowNodeId, columnId, kind }` (a thin identity snapshot); a kind reads its own *content* from the flow doc by `flowNodeId`, not from `data`.

### The canvas (XYFlow)

The canvas renders the model as an XYFlow (`@xyflow/react` v12) node graph - one full-height, side-coloured column per speech column, in document order, pannable horizontally across more columns than fit.

- **`FlowSheetPanel` is what feature code consumes** (`FlowSheetPanel.tsx`): hand it a flow-sheet `DocumentHandle` (or `null` while opening) and it stacks `ColumnControls` (the write strip) above `FlowCanvas` (the render surface) on one handle, adding no state - so the two stay in sync through `observeColumns`.
- **`FlowCanvas` is the render-only canvas** (`FlowCanvas.tsx`): a `<ReactFlow>` surface populated live via `observeColumns`, so nothing here awaits the network - it paints synchronously and fills in columns once IndexedDB has loaded into the doc (the local-first boot rule). Navigation is horizontal-only (`panOnScrollMode={Horizontal}`), zoom is locked (`minZoom=maxZoom=1`) so column heights stay 1:1 with the viewport, and `nodesDraggable`/`nodesConnectable`/`elementsSelectable` are all off. Register node kinds via its `flowNodeTypes` prop (see the [registration API](#node-container-contract-membership--vertical-order)).
- **`ColumnControls` is the write strip** (`ColumnControls.tsx`): an add form (aff/neg side toggle + label input, submit disabled until a handle exists and the trimmed label is non-empty) and, per column, an inline label editor plus reorder (← / →, disabled at the ends) and remove actions. Every gesture calls a `src/flow` helper, so all writes persist and flow through `observeColumns`. Reorder is button-driven, not drag - full drag-and-drop is deliberately out of scope but exercises the same `moveColumn` path a future drag would. Inline relabel commits on Enter or blur (Enter commits the draft directly then blurs, so a jsdom `.blur()` on a non-focused input can't drop the edit) and cancels on Escape.
- **Two-layer split for testability (the key structural decision):** XYFlow measures the DOM, which does not run under jsdom, so the model->node translation is kept **pure** and separate from the `<ReactFlow>` wiring - `column-nodes.ts` (`columnsToNodes`, `columnX`, `columnsContentWidth`, layout constants `COLUMN_WIDTH`/`COLUMN_GAP`/`DEFAULT_COLUMN_HEIGHT`, node type `SPEECH_COLUMN_NODE_TYPE`) for columns and `node-host.ts` (`flowNodesToNodes`, `flowNodeY`, `registryToNodeTypes`) for hosted nodes. Each column maps to one `speechColumn` node at `x = index*(COLUMN_WIDTH+COLUMN_GAP)`, `y=0`, and **the column id becomes the node id** (the `parentId` a hosted node references).
- **The live hooks:** `useColumns(handle)` (the `SpeechColumn`-model read the write strip consumes), `useColumnNodes(handle, height?)` (the column nodes the canvas renders), and `useFlowNodes(handle, registry)` (the hosted child nodes) - all driving the same `observeColumns`/`observeNodes` seams so every consumer agrees. A nullish handle yields `[]`.
- **Column node = a container seam:** `SpeechColumnNode.tsx` renders a labelled header (test id `speech-column`, `data-side` for the colour) + an empty `data-column-body` region; hosted flow nodes are positioned as XYFlow children over the column, not mounted into that DOM region.
- **jsdom needs a `ResizeObserver`:** `src/test/setup.ts` installs a no-op `ResizeObserver` stub (jsdom ships none) so XYFlow and `FlowCanvas` mount without throwing. It never fires; canvas tests assert structure, not measured size. XYFlow *does* render its custom nodes (columns and hosted children) under jsdom with `onlyRenderVisibleElements={false}`, so rendered-canvas assertions hold.

### Round lifecycle (a round is a flow-sheet document)

A **round is a flow-sheet document** - there is no separate round store or metadata.
`src/rounds/` maps the round concept onto the existing document layer; this is integration, not new infrastructure.

- **A round's id *is* its flow-sheet document's id.** Creating a round mints a `flow-sheet` document through the document service (`create({ kind: "flow-sheet", title })`); the returned handle's id is the round id. Opening a round is `service.open(id)` / `useDocument(id)`; the round's columns and nodes are the flow-sheet model on that document. **Round isolation is free**: each round is a separate document in its own IndexedDB database, so one round's flow-sheet edits can never surface in another.
- **`src/rounds/rounds.ts` is the whole seam:** `ROUND_KIND` (`"flow-sheet"`), `defaultRoundTitle(existingCount)`, and `useRounds()` - which layers directly on `useDocuments`, filtering the recency-ordered listing to `ROUND_KIND` and exposing `{ rounds, loading, createRound(title?), removeRound(id) }`. `createRound` returns the new round id so a caller can navigate straight to it; it defaults the title to `Round N`. No new registry, no new persistence.
- **Routing (`src/AppRoutes.tsx`):** `rounds` renders `RoundsScreen` (the index: a "New round" button that creates a round and `navigate`s to `/rounds/:id`, plus links to existing rounds), and the nested `rounds/:roundId` renders `RoundScreen` (opens the round via `useDocument(roundId)` and hands the handle to `FlowSheetPanel`). The `/rounds` NavLink is `end: false`, so it stays active on the nested route. `RoundScreen` paints synchronously and fills columns once the handle's local load resolves. If the id is not in the registry after the local load completes, it renders a "Round not found" message with a link back to `/rounds` rather than crashing or showing an empty canvas.
- **Providers stay where they are:** `DocumentsProvider` remains mounted in `main.tsx` (outside `App`) precisely so `App.offline-boot.test.tsx` renders `App` without constructing a service. Because the rounds screens consume the document service, the routed-subtree tests in `App.test.tsx` wrap `AppRoutes` in a real `DocumentsProvider` + `fake-indexeddb/auto`; the top-level `render(<App/>)` test stays at Dashboard and needs no provider.

### Tests

The layers are unit-tested in isolation, then the stack is proven end to end.
Every test follows the established pattern - `fake-indexeddb/auto` + a fresh `IDBFactory()` per test, behavioral assertions on helpers / persisted state / rendered presence, never Yjs internals or pixels.

- **Model:** `columns.test.ts` and `nodes.test.ts` cover add/relabel/move (forward, backward, clamp, id-preserving) / remove, a full edit sequence that persists and reloads through a genuinely fresh handle with stable ids, and the `observeColumns`/`observeNodes` seams (fire once per mutation, stop after unsubscribe).
- **Canvas:** the pure mappings (`column-nodes.test.ts`, `node-host.test.ts`), the node component (`SpeechColumnNode.test.tsx`, side-token classes), and `canvas.test.tsx` / `node-host.integration.test.tsx` (which drive `useColumnNodes` / `useFlowNodes` and a rendered `FlowCanvas` over a *real* handle, with an inline **stub node kind** for the hosting seam - `parentId` == `columnId`, live reaction, unregistered kinds skipped). The write strip is `column-controls.test.tsx`.
- **Rounds:** `rounds.test.tsx` drives the round lifecycle through the routed shell and the real service - starting a round opens a fresh empty canvas, a round's columns restore through a completely fresh provider (simulated restart), two rounds are isolated, and an unknown id shows the not-found state.
- **Whole-stack E2E:** `src/flow/flow-sheet.e2e.test.tsx` is the top-to-bottom proof that the composed layers hold together. It creates a round through the round seam, adds/relabels/reorders columns and places a stub node on the round's real handle, throws that service instance away, then reopens the same IndexedDB backend through a **completely fresh** service and asserts full restoration - columns in order, their labels and sides, and the node still in its column - both at the model level (`listColumns`/`listColumnNodes`) and rendered through the real `FlowCanvas` with the stub kind registered.

## Block file (the contract)

A **block file** is a debater's evidence store: one large, continuously-scrollable document split by which side of the debate the evidence supports.
The side division (affirmative / negative) is **first-class enforced structure in the ProseMirror schema**, not a heading convention - ordinary editing cannot destroy it.
`src/blockfile/` is the complete module; import everything from `src/blockfile` (the public index).

### The block-file document (fragment schema)

A block file is one `block-file` [document](#document-model-contract-shared-type-conventions): a `Y.Doc` persisted per-id to IndexedDB, reached through `openDocumentService()` like any other document.
All of its rich text lives under one reserved top-level fragment:

| Fragment | Yjs type | Constant | Holds |
|---|---|---|---|
| `body` | `Y.XmlFragment` | `BLOCK_FILE_FRAGMENT` | The one continuous editing surface - aff region first, neg region second, both enforced by the schema. |

A later PRD that needs to store block-file data outside the prose (e.g. per-card metadata) claims a **new** fragment; it never repurposes `body`.

### Schema design (two enforced section nodes)

The side division is expressed in the ProseMirror schema, not by plugin or convention:

- Two dedicated container node types - `affSection` (`AFF_SECTION_NODE_NAME`) and `negSection` (`NEG_SECTION_NODE_NAME`) - each hold ordinary `block+` content.
- The top-level `doc` node is overridden (`blockDocument`) so its content expression is exactly `"affSection negSection"` - one aff region, then one neg region, and nothing else.

Because the invariant lives in the schema, ProseMirror enforces it on every transaction for free - no plugin needed.
These behaviours are guaranteed by the schema and covered by `schema.test.ts`:

- **Select-all + delete** leaves both sections in place (each backfilled with an empty paragraph) rather than emptying the document.
- **Deleting across the aff/neg boundary** cannot merge the two regions: both section nodes are `isolating`, so a selection or join is not allowed to cross a section boundary.
- **Pasting or replacing** the whole document still resolves to a valid two-section document; `defining: true` keeps a section as the surrounding context rather than letting a paste dissolve it.

**Why two distinct node types instead of one node with a `side` attribute:** encoding the side in the node type (not an attribute) lets the single `doc` content expression `"affSection negSection"` pin down identity, order, and cardinality in one place.
A one-node-with-attribute design (`sideSection{2}`) could not tell ProseMirror that the first must be aff and the second neg.

**Why sections are not in the `block` group:** keeping them out of `block` makes it structurally impossible for a section to nest inside another section's `block+` content.

### Installing the schema

Layer `blockFileExtensions` onto the shared preset's feature-extension seam - it is not a fork of the editor core:

```ts
const editor = createEditor({
  binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
  extensions: editorPreset({ extensions: blockFileExtensions }),
});
// or in React:
// <DocumentEditor handle={handle} fragment={BLOCK_FILE_FRAGMENT}
//   preset={{ extensions: blockFileExtensions }} />
```

`blockFileExtensions` is `[blockDocument, affSection, negSection]`.
`blockDocument` overrides the baseline `doc` node; because feature extensions are layered after the editor-core baseline by the preset, the override wins.
Tiptap logs a one-line "Duplicate extension names" warning for the shadowed baseline `doc` - that is expected and harmless.
The Yjs undo rule is untouched: `blockFileExtensions` contributes only schema nodes, no `History` extension.

### Side type

`BlockSide` (`"aff" | "neg"`) is the block-file module's own type for the two sides - independent of the flow module's `FlowSide` even though both use the same vocabulary.
`BLOCK_SIDES` (`["aff", "neg"] as const`) is the canonical document order (aff first, then neg), and `isBlockSide` is the guard.
`SIDE_SECTION_NODE_NAME` maps each side to its node-type name string.

### Addressing helpers

`src/blockfile/sections.ts` is the stable query layer that locates each side's content region so later tooling can act on it.
All helpers are pure derivations of ProseMirror state (no plugin, no cache) - the same snapshot discipline as the [outline query](#editor-headings--outline-toc-seam).

- **`BlockSideRegion`** - the located region for one side: `{ side, node, pos, contentStart, contentEnd }`.
  `pos` is the ProseMirror position immediately before the section node; `contentStart = pos + 1` is the first position inside the section's content; `contentEnd = contentStart + node.content.size` is just past the last child.
  Positions are valid only against the document version they were read from - re-derive after edits.
- **`sideRegionsFromDoc(doc)`** - walks a block-file document node and returns both regions as `Record<BlockSide, BlockSideRegion>`.
  Throws if either section is missing (that would be a schema violation, a bug).
- **`getSideRegions(editor)`** - the editor convenience form; equivalent to `sideRegionsFromDoc(editor.state.doc)`.
- **`getSideRegion(editor, side)`** - single-side convenience.
- **`focusSide(editor, side)`** - moves the selection to the start of a side's content and focuses the editor; the "jump to this side" gesture a ToC or navigation control drives. Returns the editor for chaining.

### Argument-section query

`src/blockfile/argument-sections.ts` is the per-side query seam that locates argument-type sections within a side.
A debater groups evidence under **argument-type headers** like `AT: Gold` or `AT: Fusion` inside a side's region.
These headers are **ordinary shared headings** - not new schema nodes - because argument sections come and go as cards are cut, whereas the aff/neg side division is structurally enforced and permanent.

**The contract:** a **level-`BLOCK_SECTION_HEADING_LEVEL` (1) heading that is a direct child of a side region** is an argument-type section.
Deeper headings (subpoints, card tags, analytics) nest *within* the section they fall under and are not counted.
`BLOCK_SECTION_HEADING_LEVEL` is a stable contract the ToC, speech-doc pipeline, and navigation read - never repoint it without a coordinated migration.

- **`BlockSection`** - the snapshot for one argument section: `{ side, label, level, pos }`.
  `label` is the heading's plain text (inline marks flattened).
  `pos` is the ProseMirror position immediately before the heading node - same snapshot semantics as `OutlineHeading` and `BlockSideRegion`; `pos + 1` addresses a selection inside the heading.
  Valid only against the document version it was read from; re-derive after edits.
- **`sideSectionsFromDoc(doc, side)`** - the shared walker: takes a ProseMirror doc node, walks only the direct children of the given side's region, and returns `BlockSection[]` in document order.
  Throws (via `sideRegionsFromDoc`) if the document is not block-file shaped.
  For callers that already hold a doc node (e.g. one parsed from persisted JSON).
- **`getSideSections(editor, side)`** - the editor convenience form; equivalent to `sideSectionsFromDoc(editor.state.doc, side)`.
  Pure over the editor's current state.
- **`observeSideSections(editor, side, listener)`** - subscribes to one side's sections: fires `listener` immediately with the current list and again after every `docChanged` transaction (selection-only moves do not refire), mirroring `observeOutline`.
  Returns an unsubscribe function.
  This is the API a per-side ToC consumes.

**Scope:** query seam only - no section add/rename/reorder maintenance ops (those live in [Section maintenance operations](#section-maintenance-operations) below) and no UI/React/ToC rendering.

### Section maintenance operations

`src/blockfile/section-ops.ts` is the write counterpart to the read-only argument-section query: the side-scoped operations a debater performs on argument sections - **add**, **rename**, **reorder**.
Every operation is expressed through the shared editor's command API, so it is one ProseMirror transaction on the Yjs-bound editor: it persists through the document layer for free and is one Yjs undo step (the no-`History` undo rule - this module adds no history stack).

- **The section content-block boundary (the contract these ops move):** a section is a level-`BLOCK_SECTION_HEADING_LEVEL` heading that is a direct child of a side region (the [query contract](#argument-section-query)); its **content block** is that header *plus every direct child under it* up to, but not including, the next section header in the same side, or the side's end. Reorder moves this whole block, never just the header. Content before a side's first header is **preamble** (e.g. the schema-backfilled empty paragraph) and stays at the top of the side across every reorder. `getSectionRange(editor, side, index)` / `sectionRangeFromDoc(doc, side, index)` expose this `[from, to)` boundary as document positions.
- **Sections are addressed by index within the side** - the 0-based position in `getSideSections` order, a snapshot identifier valid against the document just read (same discipline as a `BlockSection.pos`).
- **Helpers (import from `src/blockfile`):**
  - `addSection(editor, side, label, placement?)` - inserts a new level-1 section header. `SectionPlacement` is `"start" | "end" (default) | { before: index } | { after: index }`; `after` lands past the referenced section's *whole block*. Throws if a `before`/`after` index is out of range.
  - `renameSection(editor, side, index, label)` - replaces only the header's inline text, so the heading node (and the section) survives; body content is untouched. Throws on an out-of-range index.
  - `moveSection(editor, side, fromIndex, toIndex)` - reorders a section within its side, carrying its entire content block. Rebuilds the side's content from the same child nodes in a new order inside one `command`/`replaceWith` transaction (identity and rich content preserved, not re-created). Clamps `toIndex`, no-ops if unchanged, throws on out-of-range `fromIndex`.
- **Cross-side integrity is structural:** every op works entirely inside one side's region (`getSideRegion`), and a reorder replaces only the *content* range of a single section node - so it can never cross the `isolating` aff/neg boundary or disturb the `affSection negSection` doc shape.

### Block-file workspace + screen (the app-shell wiring)

The block file is wired into the app shell as a **workspace singleton** - one block file per workspace, for now (multiple block files are out of scope).
`src/blockfile-workspace/` is the seam; `src/screens/BlockFileScreen.tsx` is the routed screen at `/blocks` (the existing `Block File` NavLink in `RootLayout`).
This layer only *consumes* the block-file public surface (`src/blockfile`), the shared editor primitive, and the document service - it never touches `src/blockfile` internals.

- **Identity is kind-scoped, not a hard-coded id.** There is no user-managed block-file list; the singleton *is* the first (only) `block-file` document in the shared registry, found-or-created by kind. Keeping identity kind-scoped (rather than a fixed magic id) leaves room for a future multi-block-file PRD to list every `block-file` document and drop the "first one" convention with no migration.
- **`ensureBlockFile(service)` is the find-or-create primitive** (`workspace.ts`): awaits `service.whenReady`, returns the existing block file's id or `create({ kind: "block-file", title: "Block File" })`. It is memoised **per service** via a `WeakMap<DocumentService, Promise<string>>`, so StrictMode's double-invoked effects and a fast navigate-away/back collapse onto **one** create - the workspace never ends up with two block files. A rejected ensure is evicted from the map so a later mount can retry. Nothing awaits the network.
- **`useBlockFile()`** layers `ensureBlockFile` + `useDocument(id)`: returns `{ handle, loaded, version, resolving, error, retry }`. `resolving` is true until the singleton id is known; then `handle`/`loaded` follow the usual `useDocument` contract. `error` is set when `ensureBlockFile` rejects for a reason other than service closure; `retry` is a callback that re-runs the effect so the screen can recover from a transient failure. Because it awaits only local reads, the screen stays within the local-first boot rule.
- **The screen** binds `DocumentEditor` to `BLOCK_FILE_FRAGMENT` (`body`) with `preset={{ extensions: blockFileExtensions }}` held as a **module-level constant** (the stable-preset contract - an inline object would falsely signal a config change each render). It follows `RoundScreen`'s flex-fill height (`flex-1 min-h-0`, scroll on the inner panel) with no viewport offsets, shows a brief "Opening block file…" line until `!resolving && loaded`, and renders an error message with a Retry button when `error` is set. There is no not-found state - the singleton is created on first visit.
- **Side visual distinction is CSS-only, token-keyed.** The editor container carries the `block-file-editor` class; `src/index.css` gives `section[data-side="aff"|"neg"]` (the schema's rendered regions) a light left accent border + an `::before` "Affirmative"/"Negative" label using `--color-aff-strong`/`--color-neg-strong` - never raw hex, and no DOM/schema changes.

### Long-document responsiveness (measured; no virtualization)

A season's block file is large - many argument sections per side, each with a stack of cut cards - so the scaffold was measured against a representatively large document before shipping any optimization. **Conclusion: no virtualization or other optimization is warranted now**; the block-file layer adds no document-sized cost of its own, and ProseMirror's single-editor render is comfortably fast well past a real season. Introduce virtualization only if a real, measured regression appears at realistic sizes.

- **Complexity is the load-bearing evidence, not the clock.** Every query and section op is scoped to *one side's direct children* (`region.node.forEach` in `argument-sections.ts` / `section-ops.ts`) and `sideRegionsFromDoc` touches only the two top-level section nodes - so query and reorder cost is **O(direct children of the side)**, independent of how deep the card text under each section runs. Nothing here walks the whole document. The only inherently document-sized cost is ProseMirror's own parse/render of one large doc on mount, a property of holding the file in a single editor, not of anything this module adds.
- **Measured (`long-document.perf.test.ts`, jsdom - indicative wall-clock).** At 60 sections/side (1080 block nodes, ~38k words - past a realistic season): initial render (parse persisted doc) ~110ms, edit mid-document ~7ms, `getSideSections` ~0.07ms/call, `moveSection` carrying a whole content block ~50ms. All linear-or-better and far below any responsiveness threshold. jsdom timing is indicative only (no real layout/paint), so the test's ceilings are **smoke alarms for an accidental O(n²) full-document scan**, not tuned thresholds; the complexity argument above is the real guarantee.

### Tests

Every test follows the established pattern - `fake-indexeddb/auto` + a fresh `IDBFactory()` per test, behavioral assertions, never ProseMirror internals or pixels.

- **`schema.test.ts`** - proves the enforced structure: select-all-delete, cross-boundary delete, and paste/replace all preserve both sections; the schema serializes and reloads correctly through a fresh handle+editor; marks and headings from the shared preset compose on section content.
- **`sections.test.ts`** - proves the addressing helpers: `getSideRegions` returns correct positions for both sides; `contentStart`/`contentEnd` bound the right content; `focusSide` moves the selection to the correct side; `sideRegionsFromDoc` throws on a non-block-file document.
- **`argument-sections.test.ts`** - proves the argument-section query seam: empty side returns no sections; level-1 headings that are direct children of a side are found with correct label/level/pos; deeper headings are not counted; sections from one side do not appear in the other; `pos + 1` selects inside the heading (end-to-end through a fresh handle+editor); `observeSideSections` fires immediately, reflects add/edit/remove, ignores selection-only changes, and stops after unsubscribe.
- **`section-ops.test.ts`** - proves the maintenance operations: add at start/end/before/after (with `after` landing past a section's body); rename persists and keeps the heading + body; reorder moves the full content block (a section's body paragraphs travel with its header, preamble stays on top); cross-side integrity (no aff/neg leak, `affSection negSection` shape preserved); operations persist through a fresh handle+editor reload; and reorder/rename are undoable via the Yjs history (`editor.commands.undo()`, with a `stopCapturing` boundary isolating the tested op).
- **`../blockfile-workspace/workspace.test.tsx`** - proves the workspace wiring by driving the routed screen through a real `DocumentsProvider`: the heading paints synchronously, a fresh visit mounts the editor with both `data-side` regions, seeded aff/neg text restores through a completely fresh provider (simulated relaunch), repeat visits reuse the one block file, and `ensureBlockFile` is idempotent under concurrent/repeat calls (exactly one `block-file` doc). Error and retry paths are covered via `DocumentsContext` injection: a rejected `list` shows the error message and Retry button; clicking Retry after a transient failure recovers to the editor.
- **`block-file.e2e.test.ts`** - the whole-stack proof over the real service: `ensureBlockFile` mints the workspace singleton, then add sections under *both* sides, add card content, rename one section and reorder another (carrying its content block); the entire service instance is thrown away and a *completely fresh* service reopens the same IndexedDB backend, which `ensureBlockFile` resolves to the **same** singleton (no second block file), and the reload restores both enforced sides, section order, labels, and content.
- **`long-document.perf.test.ts`** - the responsiveness evidence (see [Long-document responsiveness](#long-document-responsiveness-measured-no-virtualization)): builds a season-sized file and measures build / initial render / mid-document edit / section query / section reorder, logging indicative jsdom timings and asserting generous ceilings that catch an accidental full-document O(n²) scan.

The expected `[tiptap warn] Duplicate extension names: ['doc']` line in these tests is the block schema's deliberate `doc` override, not a failure.

## Table of contents sidebar

`src/toc/` is the persistent ToC sidebar - a live projection of a document editor's heading outline, rendered alongside the editor (first consumer: `BlockFileScreen`).
It only *consumes* the heading layer's public seams (`observeOutline` + `buildOutlineTree`/`OutlineTreeNode` from `src/editor/headings`); it never re-derives outline structure.

- **`TableOfContents({ editor, scrollContainer? })`** is the sidebar region: an always-visible `<nav aria-label="Contents">`, not a toggled/collapsible panel. It renders its chrome synchronously even with a `null` editor or no headings (empty state), so it is stable layout, not a gate. It renders the nested tree recursively as `<ul>/<li>`, each heading a `TocRow`; children nest inside their parent's `<li>` (matching the tree derivation), keyed by heading `pos`. It threads the `editor` down to every row so clicking a row scrolls the document to that heading (see click-to-scroll below). When a `scrollContainer` is passed it also highlights the entry for the section currently in view, tracked live via `useActiveHeading` (see below).
- **`TocRow({ node, leadingControl?, active?, onActivate? })`** is one heading row - a flat, presentational unit (not recursive; nesting is the tree renderer's job). `leadingControl` is a reserved slot rendered *before* the label (test id `toc-row-leading`), unused today: a later speech-doc-pipeline feature drops a per-heading "include" checkbox in it **without editing this component's structure**. Omitted -> no leading element at all. `active` marks the row as the section in view: it gets a token-only highlight (`bg-shell-bg font-medium`), `data-active="true"`, and `aria-current="location"`; omitted/false leaves the row unmarked. `onActivate` makes the label a `<button>` (keyboard-reachable navigation target) that fires on click; omitted -> a plain, non-interactive `<span>`.
- **Click-to-scroll (`navigateToHeading(editor, pos)`):** the gesture a row drives - it applies the outline query's documented scroll recipe (`editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run()`) to move the selection into the heading at `pos`. Because a ToC holds `pos` *snapshots*, it **re-guards against a stale position**: an out-of-range `pos`, or one that no longer addresses a `heading` node in the current document, is a no-op (returns `false`) rather than a throw or a wrong-node jump. `scrollIntoView` is a ProseMirror transaction meta flag, not DOM `scrollIntoView`, so it is safe under jsdom. `TableOfContents` builds each row's `onActivate` as `() => navigateToHeading(editor, node.pos)` (a nullish editor renders inert rows).
- **`useOutlineTree(editor)`** layers the two seams: `observeOutline` (fires immediately + on every `docChanged`, ignores selection-only moves) shaped by `buildOutlineTree`. A nullish editor yields `[]`; the subscription follows editor identity and detaches on unmount.
- **Current-section highlighting (`active-heading.ts` + `useActiveHeading.ts`):** the pure `findActiveHeading(offsets, scrollTop)` maps each heading's content-top offset + the scroll position to the single active heading `pos` - the closest preceding one (greatest `top <= scrollTop`, within `ACTIVE_HEADING_TOLERANCE`), falling back to the first heading when scrolled above all of them, so exactly one entry is ever active. `useActiveHeading(editor, scrollContainer)` is the DOM half: it measures each heading's offset (`view.nodeDOM(pos)` rect converted to container-content coordinates), recomputes on the container's `scroll` events and on editor `update` (docChanged shifts offsets), and returns the active `pos`. This is the pure-vs-DOM split the flow canvas uses - the decision is unit-tested without layout; the measurement/scroll wiring is exercised in the integration test via stubbed rects. A nullish editor or container yields `null`.
- **Screen wiring:** the ToC needs the *same* live editor the surface renders, so `BlockFileScreen` owns the editor via `useDocumentEditor` (the documented toolbar-style pattern) and renders `<EditorContent editor={editor}/>` itself instead of delegating to `DocumentEditor`; it passes that editor to `TableOfContents`. It also captures its editor-wrapping scroll region via a callback ref held in state (so the ToC re-renders once the element mounts) and passes it as `scrollContainer` so the sidebar can track scroll position. Because `preset` is not deep-compared by `useDocumentEditor`, the block-file preset stays a module-level constant and `[handle]` is the rebuild dep.
- **Tests** (`TocRow.test.tsx`, `TableOfContents.test.tsx`, `active-heading.test.ts`, `navigateToHeading.test.tsx`) follow the established pattern. The row test is a pure render (no editor/IndexedDB) proving the label renders, the leading slot is present only when passed, the active state sets `data-active`/`aria-current`, and `onActivate` makes it a clickable button. `active-heading.test.ts` is a pure unit test of `findActiveHeading` (empty, above-first, exact boundary, between, past-last, unsorted, sub-pixel). The sidebar test drives a *real* block-file editor+handle: headings from both aff and neg sides are listed, a deeper heading nests under its shallower parent (asserted via the parent's `<li>` containing the child), add/rename/delete each update the list with no manual refresh, clicking a row moves the selection into the clicked heading, and - with stubbed heading/container rects - the highlight starts on the first section and follows `scrollTop` across the aff/neg boundary with only one entry active at a time. The `navigateToHeading` test drives a real editor: navigation lands the selection inside aff- and neg-side headings, and a stale or out-of-range `pos` is a safe no-op.
- **Whole-stack E2E:** `toc-sidebar.e2e.test.tsx` is the top-to-bottom proof that the composed layers hold together as the screen wires them. It seeds a block file with headings across *both* sides through a throwaway service, flushes to IndexedDB, then renders the exact `BlockFileScreen` editor+ToC composition (workspace singleton via `useBlockFile`, editor via `useDocumentEditor` + `EditorContent`, live `TableOfContents`) over a *fresh* provider and asserts the three user-visible behaviours end to end: the ToC populates from the persisted document (both sides, no manual refresh), clicking an entry moves the shared editor's selection into that heading (click-to-scroll), and scrolling moves the highlight across the aff/neg boundary with only one entry ever active (current-section highlighting, with stubbed rects for jsdom's absent layout).
- **Long-document responsiveness (measured; no optimization warranted).** `long-document.perf.test.tsx` mirrors the block file's [Long-document responsiveness](#long-document-responsiveness-measured-no-virtualization) precedent for the ToC: it builds a season-plus-sized outline (60 sections/side, each nested three heading levels deep = 480 headings) over a real block-file editor and measures the sidebar's hot paths - `getOutline` (whole-document walk), `buildOutlineTree` (pure flat->nested fold), the `TableOfContents` mount + re-render after a heading edit, and the `findActiveHeading` scroll-highlight decision swept across the full scroll range. All are single linear passes and land far below generous ceilings (smoke alarms for an accidental O(n^2) per-heading document re-walk, not tuned thresholds); jsdom wall-clock is indicative only. Conclusion: the ToC layer adds no document-sized cost of its own, so **no memoization or virtualization is warranted now** - revisit only on a real, measured regression.

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
