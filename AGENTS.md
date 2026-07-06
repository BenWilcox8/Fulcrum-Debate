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

### Recent-documents query (`src/documents/registry/query.ts`)

`recentDocuments(source, query?)` is the synchronous, local-only read seam for recency surfaces (e.g. the launch dashboard's Resume/Recent zone). Re-exported from `src/documents/registry`.

- **Pure data seam.** It consumes a `Pick<DocumentRegistry, "list">` and returns `RegistryEntry[]`; no async, no I/O, no network. It does **not** re-sort - it rides `list()`'s documented last-edited-descending, stably tie-broken order (the same "never re-derive" discipline as the ToC), and filtering/capping preserve that order.
- **`RecentDocumentsQuery`** is `{ kind?, limit? }`. `kind` is one `DocumentKind` or an array (e.g. flow sheets *and* block files); omit for all kinds. `limit` caps to the most-recent N after filtering (non-positive/omitted = no cap).
- Because it reads only through `list()`, tests drive it with a real registry (fake-indexeddb) or a plain `{ list: () => entries }` stub. `query.test.ts` covers ordering, single/multi-kind filtering, the no-filter case, limit (alone and with a kind), empty registry, synchronicity, and the stub-source path.

### Namespaced preference store core

`src/preferences/store/` is the typed, namespaced preference store core - the pure, in-memory foundation feature settings sections register against (formatting, tools, shorthand config, ...). It is the first slice of the Settings Shell & Preferences Store feature; persistence and React bindings are follow-up slices that attach at its seams, so the core stays **free of React and Tauri imports**. It lives inside the existing `src/preferences` home (one coherent preferences module) and is re-exported from `src/preferences` and `src/preferences/store`.

- **The store:** `createPreferenceStore()` (`store.ts`) returns a `PreferenceStore` with `registerSection(definition)`, `getSection(id)`, and `listSections()` (registration order preserved for a stable settings UI). It is distinct from the theme `PreferencesProvider`/`usePreferences` (that is the Rust-owned single-shape app store over the IPC seam); this core is a general section registry with no persistence of its own; persistence is handled by the separate `openPreferenceStore()` wrapper in `persistence.ts`.
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

#### Local persistence (slice 2)

`src/preferences/store/persistence.ts` adds local persistence at the core's seams **without reworking it**: `openPreferenceStore()` wraps a fresh `createPreferenceStore()` and returns a `PersistentPreferenceStore` (the same registration surface plus `whenLoaded`, `loaded`, and `close()`). Re-exported from `src/preferences` and `src/preferences/store`.

- **Mechanism = y-indexeddb, mirroring the document registry.** The store holds arbitrary section x key JSON, a shape the fixed Rust `Preferences` struct behind the IPC seam cannot represent, so it uses one well-known Y.Doc (`PREFERENCES_DB_NAME = "fulcrum:preferences"`, a sibling of `fulcrum:registry`) bound by the same `IndexeddbPersistence` provider the document core uses. It is offline and free of React/Tauri, matching the core's constraint. `whenLoaded` reflects local IndexedDB read completion only - never the network - so it is not a boot blocker.
- **Only overrides are stored, never baked defaults.** Persistence derives what to write purely from the public seam (each field's `default` plus `getAll`): a key is written only when its value differs from the field default. Unset keys (and keys set back to default) store nothing, so they resolve to the registered default on reload - and a future default change flows through to any key the user never diverged.
- **Write** = subscribe to each section, rebuild that section's nested override map wholesale on every set/reset. **Read** = on `whenLoaded`, seed stored overrides back via `handle.set`, but skip any key the user already diverged during the load gap (never clobber an in-flight choice). Hydration snapshots the stored map first and suppresses re-persist while seeding, so a section cannot clobber its own not-yet-applied keys.
- **Tests:** `persistence.test.ts` uses `fake-indexeddb` (fresh `IDBFactory()` per test, same restart pattern as the registry) to prove real round-trips: set-survives-restart, unset-keys-still-default, object values, reset-forgets, no-clobber-during-load-gap, plus an offline block that stubs every network transport to throw.

## Settings screen shell (`src/settings/`)

The routed Settings screen and its contribution seam over the preference store. It is a UI layer only - it owns no preference data; sections and their values live on the shared `PreferenceStore` (`src/preferences`). `App` wraps the router in `PreferenceStoreProvider` + `SettingsProvider` (both pure/in-memory, so they are boot-path safe); the `/settings` route is registered in `AppRoutes` and linked from `RootLayout`'s primary nav.

- **A feature contributes one `SettingsContribution` = `{ definition, panel? }`** - the section schema to register plus the optional React panel that renders it. Add real feature contributions to `SETTINGS_CONTRIBUTIONS` (`contributions.ts`); the Evidence Formatting feature's panel is the first real contribution (wired via `formattingSettingsContribution`). The `demo` section (`src/settings/demo/`) remains as a reference example until it is retired. A contribution *without* a panel still appears as a navigable, resettable entry with a placeholder body.
- **`SettingsProvider({ contributions })`** registers every contribution's section against the `usePreferenceStore()` store (once, in a lazy `useState` initializer, so sections exist before the shell first calls `listSections()` - `registerSection` is idempotent, so a StrictMode/hot-reload re-run is safe) and exposes the panels by id via context (`useSettingsPanels`).
- **`SettingsScreen`** is master-detail: the left `<nav aria-label="Settings sections">` lists `store.listSections()` in registration order; the detail pane renders the active section's contributed panel (or the "no settings UI" placeholder) plus a **Reset to defaults** control that calls `handle.reset()` - section-scoped, so it restores that section only.
- **Gotcha - panel variance:** a `SettingsPanel<S>` consumes a `SectionHandle<S>`, so it is contravariant in `S`; a `SettingsContribution<SpecificSchema>` does not widen to the generic `SettingsContribution` on its own. Author contributions through **`defineSettingsContribution(...)`** - it type-checks the panel against its section schema at the definition site, then erases the generic (the shell only ever invokes a panel with its own section's handle, so the erasure is sound). The demo panel lives in its own file (`DemoSettingsPanel.tsx`), separate from the section-definition module, to satisfy `react-refresh/only-export-components`.
- **Tests:** `settings.test.tsx` covers section listing, default/selected panel render, panel switching (incl. the no-panel placeholder), live re-render on set, section-scoped reset, and the empty state; `settings-navigation.test.tsx` renders the real `App` to prove the route is reachable from the nav chrome and the shipped demo section renders its panel. `settings.e2e.test.tsx` is the whole-stack closeout: it contributes a section over a *persistent* store (`openPreferenceStore`), changes a value through the real `SettingsScreen` UI, asserts a separate consumer updates live, proves the override survives reopening a fresh store over the same y-indexeddb backend, and that reset restores the default (live and in storage).

## Dashboard home screen (`src/screens/DashboardScreen.tsx` + `src/screens/dashboard/`)

The prep-centric home rendered on the default index route. It renders synchronously from local data with no spinner or connecting state (upholds local-first boot). `DashboardScreen` is a thin composition of three zone components, in descending prominence:

- **`ResumeRecentZone`** (most prominent - an elevated bordered/shadowed card) fills its slot with recent resumable documents: it reads the live registry, narrows to the resumable kinds via the documents-layer `recentDocuments` query (riding its last-edited-descending order, never re-sorting), and renders each as a one-click `<Link aria-label="Resume {title}">` into its editor. **Routing map:** `flow-sheet` → `/rounds/{id}` (the round id *is* the flow-sheet document id); `block-file` → `/blocks` (the single workspace singleton). Other kinds (e.g. `speech-doc`) have no editor route yet and are omitted rather than linking nowhere. Empty registry → a plain empty-state card, never a broken zone.
  - **Gotcha - provider-optional reader:** the zone reads the document listing through a local `useResumeDocuments` hook that consumes `DocumentsContext` directly and *tolerates its absence* (returns `[]`, shows the empty state) rather than throwing like `useDocuments`. This is deliberate: `DocumentsProvider` lives in `main.tsx` *outside* `App`, so `App.offline-boot.test.tsx` renders a bare `App` with no provider (and no IndexedDB) to prove nothing on the boot path constructs a service. Degrading to empty keeps the dashboard painting there. The hook also guards `subscribe` with `service.closed` - during a StrictMode/remount swap a closed service can transiently sit in context, and `service.subscribe` throws on a closed service.
- **`StartSomethingNewZone`** is wired: `New round`, `New card`, `Open block file` buttons. **Gotcha - the dashboard is boot-path code, so this zone holds no document service** (the `DocumentsProvider` is mounted outside `App`; `App.offline-boot.test.tsx` renders `App` bare). Every action therefore *navigates only* and the destination route owns the create/open primitive - never call `useDocuments`/`useDocumentService`/`useRounds` from a default-route (`/`) component or you break offline boot. `New round` → `/rounds/new`; `Open block file` and `New card` → `/blocks`. `New card` shares the block-file destination as a **documented interim placeholder** (no standalone card editor exists yet; cards are cut inside the block file) - when a card editor lands, only that handler changes.
- **`/rounds/new` (`NewRoundScreen`)** is the create-and-redirect seam: it `createRound()`s (off the boot path, so it *may* hold the service) and `navigate(..., { replace: true })`s to `/rounds/:id`. Declared as a static route *before* `rounds/:roundId`. This is the pattern any "create X from the dashboard" action should follow.
- **`LibraryNavZone`** is complete: `<Link>`s onto the existing `/blocks` and `/rounds` screens.
- **Gotcha - duplicate nav links:** the Library zone links to Block File/Rounds, so at `/` those link names now match in *two* places (primary nav + dashboard). Any test doing a global `getByRole("link", { name: /block file|rounds/i })` throws "multiple elements" - scope such queries to the primary nav via `within(screen.getByRole("navigation", { name: /primary/i }))`. `App.offline-boot.test.tsx` and `App.test.tsx` were updated this way; keep it.
- **Tests:** `DashboardScreen.test.tsx` covers default-landing + no-connecting-gate, all three zones as labelled regions (`<section aria-labelledby>` → `role="region"`), Resume-first reading order, the filled recent slot + live/enabled create actions wired end-to-end, and Library navigation into both screens. `ResumeRecentZone.test.tsx` covers the filled zone: recency-ordered listing + kind filtering + resume hrefs over a stub `DocumentService` (via `DocumentsContext.Provider`), the empty state, and a routed real-service test that seeds a round then proves one click lands in its flow-sheet editor. `StartSomethingNewZone.test.tsx` unit-asserts the navigation targets; `NewRoundScreen.test.tsx` proves the create primitive runs and redirects. `dashboard.e2e.test.tsx` is the whole-stack closeout: it mounts the real `App` (HashRouter + providers) inside the real `DocumentsProvider` over a seeded, IndexedDB-persisted registry **with every network transport stubbed to throw** (the `App.offline-boot.test.tsx` guard), proving all three zones render with no connecting/loading gate, recents list in last-edited-descending order, a one-click resume lands in the right editor, and the New round action creates-and-redirects into a fresh flow sheet - all offline. It resets `window.location.hash` per test so a route a prior test navigated to never leaks in as the starting route.

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

### Card node model (`src/blockfile/card.ts`)

A debate *card* is first-class structured content that lives inside a side region, not free-form prose.
`cardExtensions` (the `card` container plus its four region nodes) layers onto a block-file editor through the same shared-preset feature-extension seam as the side schema - append it after `blockFileExtensions`, together with `cardCreate` for the keyboard shortcut: `editorPreset({ extensions: [...blockFileExtensions, ...cardExtensions, cardCreate] })`.

- **One container, four fixed regions.** `card` (node name `card`, the only card node in the `block` group) has content expression `"cardTag cardTagline cardCite cardBody"` - one of each, in order, enforced by the schema exactly like the side division. The four region nodes are deliberately **out of every group** (reachable only by name from the card's content expression), so they can never appear on their own in a section and can never nest.
- **Region content rules.** `cardTag` / `cardTagline` / `cardCite` are `content: "text*"` with `marks: ""` - plain, single-line text with no marks (`text*` is what makes them single-line). `cardBody` is `content: "paragraph+"` - block prose whose text runs carry the shared marks; **bold and highlight apply here, independently and simultaneously on the same run**. `paragraph+` (not `block+`) keeps cards from nesting and keeps headings out of a card body.
- **The tag renders bracketed, stores bare.** `cardTag` accepts any free-form token (it is **not** a fixed enum - `[T]`, `[NU]`, `[CP]`, ...); the token is stored without brackets, and the node renders literal `[`/`]` around a `data-card-tag-token` span. `contentElement` re-parses only that inner span so brackets are never re-absorbed as content on an HTML round-trip.
- **No CSS, data-attribute hooks.** Each region serializes with `data-card-region="tag|tagline|cite|body"` (the tagline's emphasis is a later styling PR's hook); this module ships no CSS, same as the side sections.
- **`buildCardContent(fields?)`** is a pure document-JSON builder (the seam the quick-create UI/tests use) - every field free-form and optional; its output matches what the schema auto-fills for a bare card (empty text regions, an empty body paragraph via `createAndFill`).
- **Gotcha - inserting a card via `insertContentAt`:** tiptap's `insertContentAt` *validates* content strictly (it does not `createAndFill` the inserted node), so insert a full node from `buildCardContent`, not a bare `{ type: "card" }`. Pass `{ updateSelection: false }` when inserting so the cursor is not placed inside the block-level card. Separately, y-prosemirror emits a one-time `TextSelection endpoint not pointing into a node with inline content (card)` warning if a *reloaded* document **begins** with a card (a non-textblock leading node); tests append cards after the side's leading paragraph to avoid the artificial edge.
- **This slice is schema/model + tests only.** Card-cutting tools come later. `card.test.ts` covers the four-region structure, `createAndFill` auto-fill, the card inside a side region, the bracketed free-form tag, independent+simultaneous body marks, and a full Yjs round-trip (structure + marks).

### Card-as-a-unit addressability API (`src/blockfile/card-unit.ts`)

The pure query/selection seam that treats a card as an addressable **unit** on top of the card node model - the contract the card-cutting tools (Extract, Send to Block File) and drag-to-speech pipeline target. Re-exported from `src/blockfile`. Like `sideRegionsFromDoc`/`getSideSections`/`buildOutlineTree`, it is a pure derivation of ProseMirror state (no UI, nothing to invalidate); it splits into positional **location** and pure **content reading**.

- **Location.** `cardAt(doc, pos)` is the pure doc-node locator: it resolves `pos` to the enclosing `card` via ancestor walk and returns a `LocatedCard` (`{ node, from, to, regions }`) or `null`; `getCardAt(editor, pos)` is the editor form. `from`/`to` bound the whole card node - `from` is the position immediately before it (the `NodeSelection` anchor), so `[from, to]` is the range a cutting tool replaces/slices. `regions` is a `Record<CardRegionKey, LocatedCardRegion>` (keys `"tag"|"tagline"|"cite"|"body"`, ordered in `CARD_REGION_KEYS`); each region carries its node and its own `from`/`to` (content sits at `[from+1, to-1]`). **Snapshot discipline:** every position is valid only against the document version it was read from - re-derive after edits, same as the outline/side-region/section queries.
  - **Gotcha - out-of-range yields `null`, never throws:** `cardAt` guards a non-integer or out-of-`[0, doc.content.size]` `pos` and returns `null`, so a raw selection position can be passed without pre-validation (unlike `sideRegionsFromDoc`, which throws on a malformed doc).
- **Selection.** `selectCard(editor, pos?)` sets a `NodeSelection` on the whole card (`pos` defaults to the card enclosing the current selection), returning `true`/`false` (no-op) on hit/miss. It sets the selection only - **it does not focus** - so it composes with a tool that immediately transforms the selection. `getSelectedCard(editor)` reads "the card I'm working in" off the current selection; it matches both a cursor inside a card *and* a `NodeSelection` on a card (the latter's anchor sits *before* the card, so ancestor resolution alone would miss it - it is handled explicitly).
- **Reading/serialization (pure over a card node, no positions).** `readCardRegionText(card, key)` = one region's flattened text; `serializeCardRegion(card, key)` = one region node's document-JSON (marks preserved - use this for the body, not text); `readCardRegions(card)` = a `CardRegionsSnapshot` (`{ tag, tagline, cite }` as text + `body` as JSON); `serializeCard(card)` = the whole card as one re-insertable JSON node (the Extract/Send payload). All throw a clear error if handed a non-`card` node.
- **Tests:** `card-unit.test.ts` drives the locator from positions found by an *independent* document walk (never the API under test), and covers: locate-from-body/header, null for preamble/out-of-range/non-integer positions, `cardAt` doc purity, keyed region exposure; `NodeSelection` spanning the whole card + returns-true, miss returns-false-and-no-op, default-to-current-selection, `getSelectedCard` under cursor/node-selection/preamble; per-region text + JSON reads, body-mark preservation through serialization, whole-card snapshot, re-insertable whole-card round-trip, and the non-card throw.

### Quick card creation (`src/blockfile/card-create.ts`)

The one-gesture "new card" command layered on the card node model - the fast, no-dialog affordance a debater uses to drop a fresh, schema-valid card skeleton and start typing immediately. Re-exported from `src/blockfile`.

- **Two seams, one code path.** `insertCard(editor, options?)` is the imperative command (the same plain `(editor, ...) => ...` shape as `section-ops`); the Block File screen's *New card* button and the keyboard shortcut both call it, so there is one creation path. `cardCreate` is a tiny `Extension` carrying **only** the keyboard binding - append it after `cardExtensions` in the shared preset's feature-extension seam (`editorPreset({ extensions: [...blockFileExtensions, ...cardExtensions, cardCreate] })`), which is exactly what `BlockFileScreen`'s preset now does. Without `cardExtensions` in the preset the card node types are not in the schema and creation cannot work - the screen previously shipped `blockFileExtensions` only.
- **`CARD_CREATE_SHORTCUT = "Mod-Shift-c"`** - a `Mod-` chord mirroring the shared marks' shortcut convention (`Mod-b`, `Mod-Shift-h`); `c` is the card mnemonic. The button is inherently keyboard-reachable too (a real `<button>`, Tab + Enter). `BlockFileScreen` renders a platform-aware tooltip (`⇧⌘C` on macOS, `Ctrl+Shift+C` elsewhere) but the binding stays `Mod-Shift-c`.
- **Follows the caret, works in both sides.** `cardInsertPos` reads that a block file is `doc(0) > side(1) > block(2) > ...`, so depth-1 is always the side section and depth-2 the caret's top-level side block; it inserts the card as the **next sibling after that block** (`$from.after(2)`), so the card appears where the debater is working and the side never *begins* with a card (dodging the y-prosemirror leading-node warning). Fallbacks append to a side's `contentEnd`: when a `side` option is forced, or when the caret is not resolvably inside a side (e.g. a fresh unfocused editor - defaults to aff).
- **Cursor lands in the tag, ready to type.** The card opens at the insert position `at`, so `at + 2` is the first text position inside the empty `cardTag` region; `insertCard` inserts with `{ updateSelection: false }` then `setTextSelection(at + 2)` + `focus()` in one chain (one undo step). The next keystroke fills the tag.
- **Tests:** `card-create.test.ts` (unit, `fake-indexeddb`) covers the four-region insert, caret-lands-in-tag (typing flows into the tag), aff-and-neg placement, the explicit-`side` override, field seeding, sibling-after-current-block placement, and the extension registration + shortcut constant. `screens/BlockFileScreen.test.tsx` drives the real routed screen: the *New card* button appears once the editor mounts and one click renders a full card (all four `data-card-region` hooks) in the document.

### Feature closeout e2e (`src/blockfile/card.e2e.test.ts`)

`card.e2e.test.ts` is the whole-stack closeout for the Card Anatomy & Tag System feature - it spans the three card slices above (node model, card-unit API, quick-create) composed the way `BlockFileScreen` ships them, with no mocks. Over the real document service + `ensureBlockFile` singleton and IndexedDB, it drives the debater's full card lifecycle: `insertCard` (quick-create) → type all four regions → apply bold + highlight **together** on one body run → address the card as a unit (`getCardAt`/`selectCard`/`getSelectedCard`/`readCardRegions`/`serializeCard`), then tears the service down and reopens a **fresh** instance over the same backend to prove the whole card (four regions, every field's text, both coexisting body marks) survived and re-addresses it. Positions that drive the card-unit locator come from an independent document walk, never the API under test - same discipline as `card-unit.test.ts`. Follows the `settings.e2e`/`dashboard.e2e`/`toc-sidebar.e2e` closeout precedent.

## Evidence formatting standards (`src/formatting/`)

The model + preferences wiring for the product's house evidence formatting standards (Evidence Formatting Standards & Customization feature). The core (`profile.ts`, `preferences.ts`) is pure - **no Tiptap, no React**; slice 2 adds a pure profile→CSS mapping (`css.ts`) and a small React rendering layer (`src/formatting/react/`). The Settings panel (`FormattingSettingsPanel.tsx`) is this feature's Settings screen contribution. Sibling slice still to land: the unformatted-shrink rule. Re-exported from `src/formatting` (the React layer is imported directly from `src/formatting/react` so the model index stays React-free).

- **The profile (`profile.ts`).** A `FormattingProfile` is `Record<FormattingTargetKey, FormattingEntry>`; a `FormattingEntry` is `{ fontFamily, fontSize, color, bold, underline }`. The five targets (`FORMATTING_TARGET_KEYS`, stable order) mix card anatomy with body mark state: `tag`/`cite`/`body` line up with the like-named card regions (the card's fourth region, `tagline`, is *not* a separately-standardised target here); `highlight` and `unformatted` are the two body **mark states** (highlighted read-aloud text vs. the small size un-highlighted text is shrunk to). `DEFAULT_FORMATTING_PROFILE` encodes the standards exactly: Tag Calibri 13pt Bold, Cite Calibri 8pt, Body Calibri 12pt, Highlighted Calibri 12pt Underlined, Unformatted Calibri 8pt (all `#000000`).
- **Size is a point string, consistent with the mark scale.** `fontSize` is a CSS point string (`"12pt"`), the exact representation the `src/editor/marks` font-size mark stores, so a rendered size drops straight onto the mark. On-scale sizes (8/12pt) are `FONT_SIZE_SCALE` members and `unformatted` is deliberately the scale **minimum** (the Shrink tool's target). Tag's `13pt` is an off-scale *fixed* size, so the field is a free point `string`, **not** the closed `FontSize` union - a legitimate off-scale standard must be expressible and every size stays user-editable.
- **The preferences section (`preferences.ts`).** `registerFormattingSection(store)` registers the profile as section id `"formatting"` (`FORMATTING_SECTION_ID`) and returns the typed handle; idempotent, so multiple slices may call it. The section's keys **are** the target keys and each value is the whole `FormattingEntry`, so `handle.getAll()` *is* a `FormattingProfile` (`readFormattingProfile(handle)` is the typed alias) - one object drives rendering, a `set` edits one target, `reset()` restores the whole standard. Fields are built with `satisfies Record<FormattingTargetKey, PreferenceField<FormattingEntry>>` so schema keys stay exact while each default holds at the widened `FormattingEntry` type (booleans widen - the store-core convention). Every field carries a `label` (from `FORMATTING_TARGET_LABELS`) so the Settings panel renders controls straight from the schema; `FONT_FAMILY_OPTIONS` is the font-control choice list (presentation metadata, not a constraint).
- **The Settings panel (`FormattingSettingsPanel.tsx` + `formattingSettings.ts`).** The feature's Settings screen contribution, wired into `SETTINGS_CONTRIBUTIONS` via `formattingSettingsContribution`. The panel renders one `<fieldset>` (role `group`, legend = `FORMATTING_TARGET_LABELS[key]`) per target, iterating `FORMATTING_TARGET_KEYS`, with **native inputs only** (no colour-picker library): font is a text input backed by a shared `<datalist>` of `FONT_FAMILY_OPTIONS` (suggestions, not a constraint - any family may be typed); size is a numeric point control that reads `parseFloat("12pt")` and writes back `` `${n}pt` `` (preserving the point-string contract, ignoring an empty field); colour is `<input type="color">`; `bold`/`underline` are checkboxes. Each control edits **one field of one target's whole `FormattingEntry`** via `handle.set(key, { ...values[key], ...patch })`, so the one-object-drives-everything invariant holds and edits stay target-isolated. Reads ride `useSection(handle)`, so a change re-renders the panel and any other consumer live (open documents restyle without a restart); per-section reset comes from the Settings shell. **Gotcha - import from `../settings/types`, not the `../settings` barrel:** the barrel pulls `contributions.ts`, which imports `../formatting`, so going through the barrel from a formatting module is a runtime circular import (`defineSettingsContribution is not a function`).
- **Tests:** `profile.test.ts` pins the target keys, the per-entry shape, the exact standard defaults, and scale-consistency (unformatted === `FONT_SIZE_SCALE[0]`, on-scale defaults are scale members). `preferences.test.ts` (`fake-indexeddb`) covers registration under the well-known id, defaults == standards, per-field labels, idempotent re-registration preserving set values, per-entry editing isolation, reset-restores-standards, and a real `openPreferenceStore` round-trip (set survives restart, unset resolves to standard, reset forgets). `settings.test.tsx` renders the panel over a real registered section plus an independent `useSection` consumer to prove font/size/colour/bold edits apply live and stay target-isolated, the font datalist offers the shared families, and `formattingSettingsContribution` surfaces a **Formatting** section (with panel) on the real `SettingsScreen`.

### Unformatted-text shrink rule (`src/formatting/shrink.ts`)

The standing rule that a text run matching **none** of the four named styles (`tag`/`cite`/`body`/`highlight`) is *unformatted* and adopts the profile's configured shrink size (default `unformatted` = 8pt). Split into a pure classification of editor state and a thin application command; re-exported from `src/formatting`. Slice 3/5 of the Evidence Formatting feature (sibling slices do live rendering of the *named* styles and the Settings panel - keep this scoped to the unformatted-run classification + shrink application).

- **Classification is pure, over structure + marks only, never over current size.** `classifyRuns(state)` walks the doc's text nodes in order and returns `ClassifiedRun[]` (`{ from, to, classification }`, adjacent same-class runs merged); `classifyRunAt(state, pos)` is the single-position convenience (null when no text sits there). A run resolves to a named style by its enclosing card region (`cardTag`→`tag`, `cardCite`→`cite`, `cardTagline`→`body` since the tagline inherits body styling) or by mark (a `cardBody` run carrying the **highlight** mark →`highlight`). Everything else is `UNFORMATTED_TARGET_KEY` (`"unformatted"`): an un-highlighted `cardBody` run (the common case) **and any loose prose outside a card**. Deciding the target from *meaning* (region/highlight), not from the size a run happens to carry, is deliberate - a size-based rule would be circular.
- **Region resolution is an ancestor walk**, mirroring the card-unit locator: for each text node it resolves the position and walks `$pos.node(depth)` outward for the nearest card-region node type. The header regions (`text*`, `marks: ""`) can never be highlighted, so they always map to their region's named style.
- **Application shares the font-size mark model.** `applyShrinkRule(editor, profile?)` sets every unformatted run to `shrinkSize(profile)` via the same addressable `textStyle`/`fontSize` mark `src/editor/marks` owns (so a shrunk run is queryable document data, and the size model stays consistent with the future Shrink tool). The configured size is written **verbatim** - a profile may standardise an off-scale shrink size; the closed `FONT_SIZE_SCALE` is the interactive Shrink tool's *stepping* scale (a later feature) and is intentionally not imposed here. It is idempotent (skips runs already at the size, restores the prior selection) and returns whether the doc changed. This slice is the standing default only - **not** the interactive Shrink tool's progressive cycling.
- **Tests:** `shrink.test.ts` (`fake-indexeddb`, real block-file+card editor) covers per-region classification, highlighted-vs-un-highlighted body runs, loose-prose-as-unformatted, ordered non-overlapping runs with exact positions, classify-is-a-pure-read, `classifyRunAt` hit + null, `shrinkSize` default/configured, and `applyShrinkRule` shrinking only unformatted runs (named styles untouched), honouring an off-scale configured size, idempotence, and the no-unformatted-runs→`false` case.

### Live card rendering (slice 2, `css.ts` + `src/formatting/react/`)

Renders card regions and highlighted runs to the active profile, updating live when the profile is edited. The card node model ships **no CSS**, only `data-card-region` hooks and the highlight `<mark>`; this slice is the "later styling PR" that keys off those hooks.

- **Pure mapping (`css.ts`).** `formattingProfileCss(profile, { scope? })` serializes a `FormattingProfile` to a scoped stylesheet string (the seam that makes "serialized styles match the profile" directly testable). Selectors: `tag`/`cite`/`body` → `[data-card-region="…"]`; `tagline` → styled **from the `body` entry** (no separate target - it inherits body); `highlight` → `mark`. Every rule is nested under `scope` (default `DEFAULT_FORMATTING_SCOPE = ".block-file-editor"`, the `EditorContent` wrapper class) so the standard never leaks onto unrelated UI.
- **Gotcha - region rules carry the full entry; the highlight-`<mark>` rule does not.** A region rule emits family/size/color/weight/decoration as the region's default (an inline `textStyle` font-size mark - e.g. one the Shrink tool applies - still wins over the stylesheet size, so region sizing is a default, never a fight). The `mark` rule emits **only** `font-family`, `color`, and the underline `text-decoration`; it deliberately **omits `font-size` and `font-weight`** because those axes are owned by the addressable font-size mark and the independent `bold` mark - a bold+highlighted run must stay bold, and a shrunk highlighted run must stay shrunk, so emitting them here would clobber those marks. (Consequence: `highlight.bold`/`highlight.fontSize` in the profile are not rendered by this rule; the underline is the highlight treatment that has no competing mark.)
- **Reactive layer (`src/formatting/react/`).** `useFormattingProfile()` reads the live merged profile off the shared preference store (registers the `formatting` section on first use - idempotent, so it composes with the Settings-panel slice) via the store's `useSection` seam, so any edit re-renders. It is **provider-tolerant** like the dashboard's resume reader: with no `PreferenceStoreProvider` it falls back to a private, never-mutated store and reports `DEFAULT_FORMATTING_PROFILE` (a bare subtree still renders correct cards, no throw). `CardFormattingStyles({ scope? })` reads that hook and renders a `<style data-card-formatting>` with the emitted CSS; `BlockFileScreen` mounts one inside its section, so editing a target rewrites the `<style>` in place with no editor remount/reload.
- **Tests:** `css.test.ts` (pure) pins the scoped selectors, the standard's per-region declarations (tag bold 13pt, cite 8pt, body 12pt), tagline-rides-body, the highlight underline, the deliberate `font-size`/`font-weight` exclusion on the mark rule, a customized-profile round-trip, and a custom scope. `react/react.test.tsx` covers the standard read, live re-render on edit, and no-provider fallback for both the hook and `CardFormattingStyles`. `screens/BlockFileScreen.test.tsx` drives the real routed screen: the standard renders as scoped card CSS, and editing the `body` target through the shared store updates the emitted CSS live (no reload).

### Feature closeout e2e (`src/formatting/formatting.e2e.test.tsx`)

`formatting.e2e.test.tsx` is the whole-stack closeout for the Evidence Formatting Standards & Customization feature - it spans the four slices above (profile model + preferences section, Settings panel, shrink rule, live rendering) composed the way `BlockFileScreen` ships them, with no mocks. Over a real block-file editor (the exact `blockFileExtensions` + `cardExtensions` + `cardCreate` preset, real document service + `ensureBlockFile` singleton and IndexedDB, mounted through `EditorContent`) plus the live `CardFormattingStyles` and the real `SettingsScreen` carrying `formattingSettingsContribution`, all over one shared *persistent* store (`openPreferenceStore`), it drives the debater's formatting lifecycle: author a card with a highlighted + an un-highlighted body run → assert the mounted stylesheet encodes the standard (tag 13pt bold, body 12pt, highlight underline) → edit the `body` size through the real Formatting panel and assert the open card's stylesheet restyles live → edit the `unformatted` size through the panel, `applyShrinkRule` reading the live profile, and assert only the un-highlighted body run shrinks (highlighted run + header regions untouched, idempotent second pass) → the screen's per-section **Reset to defaults** restores the whole standard live and in the section values. Document reads (region carets, run ranges, applied `textStyle` font sizes) come from an independent walk, never the code under test - the same discipline as `card.e2e.test.ts`. There is no `BlockFileScreen` render: the shrink rule is an editor command with no UI yet, so the stack is composed around a real editor instance the test drives and reads directly. Follows the `settings.e2e`/`dashboard.e2e`/`card.e2e` closeout precedent.

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
