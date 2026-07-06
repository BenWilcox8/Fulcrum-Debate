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
- Tests use `fake-indexeddb/auto` + a fresh `IDBFactory()` per test (jsdom has no IndexedDB).

### Namespaced preference store core

`src/preferences/store/` is the typed, namespaced preference store core - the pure, in-memory foundation feature settings sections register against (formatting, tools, shorthand config, ...). It is the first slice of the Settings Shell & Preferences Store feature; persistence and React bindings are follow-up slices that attach at its seams, so the core stays **free of React and Tauri imports**. It lives inside the existing `src/preferences` home (one coherent preferences module) and is re-exported from `src/preferences` and `src/preferences/store`.

- **The store:** `createPreferenceStore()` (`store.ts`) returns a `PreferenceStore` with `registerSection(definition)`, `getSection(id)`, and `listSections()` (registration order preserved for a stable settings UI). It is distinct from the theme `PreferencesProvider`/`usePreferences` (that is the Rust-owned single-shape app store over the IPC seam); this core is a general section registry with no persistence of its own yet.
- **Sections are self-describing schemas.** A `SectionDefinition` is `{ id, title?, description?, fields }`; each `PreferenceField<T>` is `{ default, label?, description?, options? }`. The schema carries enough metadata (label/description/enumerated `options`) to render a settings control without the feature hand-wiring a form - the value type `T` is inferred from `default`. `SectionValues<S>` maps a schema to its concrete value object.
- **The handle:** `registerSection` returns a typed `SectionHandle<S>`: `get(key)` (falls back to the field default when unset), `set(key, value)` (immediate), `getAll()` (a snapshot), `reset()` (drops all overrides back to defaults), and `subscribe(listener)`. Only explicitly-set keys are stored, so `reset` is "forget the overrides". Reads/writes `clone` object values across the boundary (`structuredClone`; primitives pass through) so a mutated snapshot can never corrupt stored state - preference values are plain JSON-serializable data.
- **Subscription seam (the follow-up-slice attach point):** `subscribe(listener)` fires on every `set`/`reset` with the current snapshot and returns an unsubscribe; it does **not** fire immediately on subscribe (the snapshot is read separately via `get`/`getAll`), so it composes with `useSyncExternalStore` in the React-binding slice. Notifications are section-scoped - only that section's subscribers fire.
- **Duplicate registration is safe, never silent data loss.** Re-registering an id with a **structurally identical** schema (same keys and deeply-equal defaults; rendering metadata is ignored) is idempotent - it returns the existing live handle, preserving any values already set (survives StrictMode/hot-reload re-runs). Re-registering an id with a **different** schema throws a clear error naming the section, rather than clobbering data.
- **Tests:** `store.test.ts` follows the established behavioral pattern (no IndexedDB needed - the core is pure): defaults on unset reads, self-describing definition exposure, immediate set/read, section isolation, the subscribe/notify/unsubscribe seam (including no-immediate-fire and section-scoping), reset-to-defaults-with-notify, idempotent-vs-erroring duplicate registration, and snapshot immutability. Test section schemas omit `as const` so boolean/string defaults widen (a real feature widens a boolean default with `as boolean` when it needs to `set` the other value).

### Reactive React bindings for the store (`src/preferences/react/`)

The React binding layer over the store core; re-exported from `src/preferences`. It rides the store's own `subscribe` seam via `useSyncExternalStore` - never a second event system - and is separate from the theme `PreferencesProvider`/`usePreferences` (Rust-owned app store), which is untouched.

- **`PreferenceStoreProvider`** owns one app-lifetime `PreferenceStore` (created lazily, so the reference is stable), or adopts one passed via the `store` prop (tests, or a store already wired to persistence). `usePreferenceStore()` returns that shared store for a feature to `registerSection` against; it throws outside a provider.
- **`useSection(handle)`** returns the section's live typed `SectionValues<S>` snapshot and re-renders on any set/reset in that section. **`usePreferenceValue(handle, key)`** is a thin selector over it for one typed key. Hooks take a `SectionHandle` directly, so reactivity is fully decoupled from how the handle is distributed.
- **Gotcha - snapshot caching:** `getAll()`/`get()` allocate a fresh clone on every call, so `getSnapshot` must **not** call them directly (that reports a change every render and loops). `useSection` caches the snapshot and refreshes it only inside the `subscribe` listener (and once on (re)subscribe to catch a set that slipped in between render and effect), keeping the reference stable between notifications so React bails out when nothing changed.
- **Tests:** `react/react.test.tsx` covers typed defaults, live re-render on set/reset from elsewhere, stable-reference-between-notifications, unsubscribe-on-unmount, single-key selection, and the provider/`usePreferenceStore` sharing + outside-provider throw.

## Fragment convention (Yjs shared-type layout)

Each document's content lives in named top-level Yjs shared types ("fragments") on `handle.doc`.
**A fragment name is bound to a Yjs type forever** - Yjs fixes the type on first access; re-typing or renaming a shipped fragment is a bug.
Reserved fragments:

| Kind | Fragment | Yjs type | Constant |
|---|---|---|---|
| `flow-sheet` | `columns` | `Y.Array<Y.Map>` | `FLOW_COLUMNS_FRAGMENT` |
| `flow-sheet` | `nodes` | `Y.Map<Y.Map>` | `FLOW_NODES_FRAGMENT` |
| `block-file` | `body` | `Y.XmlFragment` | `BLOCK_FILE_FRAGMENT` |

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

Key gotchas:
- **Column reorder rebuilds** (safe - columns carry only primitives). Node reorder does not rebuild - nodes use a keyed `Y.Map` so attached rich content survives reorder.
- Column id becomes the XYFlow node id; flow nodes reference their column via `parentId = columnId`.
- Register node kinds via `FlowCanvas`'s `flowNodeTypes` prop (`FlowNodeRegistry`). An unregistered kind is skipped (no renderer), not an error.
- `src/test/setup.ts` installs a no-op `ResizeObserver` stub (jsdom ships none) - XYFlow requires it.

## Block file (`src/blockfile/`)

The aff/neg side division is enforced by the ProseMirror schema - `doc` content is exactly `"affSection negSection"`.
Both section nodes are `isolating`, so a selection or edit cannot cross the boundary.

Install the schema via the feature-extension seam:
```ts
createEditor({
  binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
  extensions: editorPreset({ extensions: blockFileExtensions }),
});
```

**Gotcha:** Tiptap logs `[tiptap warn] Duplicate extension names: ['doc']` because `blockDocument` overrides the baseline - this is expected and harmless.

The workspace singleton (`src/blockfile-workspace/`) is the first `block-file` document in the registry, found-or-created by `ensureBlockFile(service)`. The block-file screen (`src/screens/BlockFileScreen.tsx`) owns the editor via `useDocumentEditor` and passes it to `TableOfContents` - it does not use `DocumentEditor` directly (ToC needs the raw editor instance).

## ToC sidebar (`src/toc/`)

Consumes `observeOutline` + `buildOutlineTree` from `src/editor/headings` - never re-derives outline structure.
`TableOfContents({ editor, scrollContainer? })` is the always-visible `<nav>`; `TocRow` is one row.
`TocRow`'s `leadingControl` prop is a reserved slot for a future per-heading "include" checkbox - do not repurpose it.
`navigateToHeading(editor, pos)` guards against stale positions (out-of-range or no longer a heading = no-op, not a throw).

## Sharp edges

- **TypeScript build:** uses two plain `tsc -p ... --noEmit` passes, not project references. Keep `noEmit: true` in both tsconfigs; do not add `references`/`composite` (`tsc -b` errors TS6310/TS6306 with `noEmit`).
- **Rust toolchain** must be on `PATH` for any `tauri` command: `source "$HOME/.cargo/env"` if `cargo` is missing.
- **App icons:** `src-tauri/app-icon.svg` is the source of truth. Regenerate with `npm run tauri icon src-tauri/app-icon.svg`. Keep only the desktop assets: `src-tauri/icons/{32x32,64x64,128x128,128x128@2x}.png`, `icon.icns`, `icon.ico`, `icon.png`.
- **CSP:** `tauri.conf.json` enforces `default-src 'self'`. Inline scripts/styles and all external loads are blocked. Add an explicit CSP directive for any future feature that needs fonts, external images, or eval.

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
