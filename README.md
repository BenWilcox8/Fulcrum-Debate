# Fulcrum Debate

A local-first desktop tool for competitive debaters - flowing rounds, cutting evidence, and building speeches.

The app is a [Tauri v2](https://v2.tauri.app/) desktop shell wrapping a React + TypeScript front end built with [Vite](https://vite.dev/), styled with [Tailwind CSS](https://tailwindcss.com/), and navigated with [react-router-dom v7](https://reactrouter.com/) in `HashRouter` mode (required for Tauri's `file://` context).
It is strictly local-first: it boots and renders with zero network dependency.

## Prerequisites

- **Node.js** 20+ and npm (the front end is built with Vite).
- **Rust** stable toolchain via [rustup](https://rustup.rs/) (Tauri compiles a native Rust shell).
- **Platform dependencies for Tauri v2.**
  Follow the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/) for your OS.
  On macOS this means the Xcode Command Line Tools (`xcode-select --install`).

## Getting started

Install the JavaScript dependencies:

```bash
npm install
```

## Development commands

| Command | What it does |
| --- | --- |
| `npm run tauri dev` | Launch the app in a native desktop window with hot reload. |
| `npm run dev` | Run only the Vite front end in the browser (no desktop shell). |
| `npm run build` | Type-check and build the production front-end bundle. |
| `npm run tauri build` | Produce a distributable native desktop binary. |
| `npm test` | Run the unit test suite once (Vitest + React Testing Library). |
| `npm run test:watch` | Run the tests in watch mode. |
| `npm run lint` | Lint the TypeScript / React sources with ESLint. |

## Project layout

```
.
├── src/                    React + TypeScript front end
│   ├── App.tsx             App shell: preference store + settings providers wrapping the HashRouter
│   ├── AppRoutes.tsx       Route table - kept separate so tests can use MemoryRouter
│   ├── RootLayout.tsx      Persistent app frame: nav chrome + routed <Outlet>
│   ├── screens/            Feature screens (one per primary area)
│   │   ├── DashboardScreen.tsx
│   │   ├── dashboard/      Dashboard zone components (ResumeRecentZone, StartSomethingNewZone, LibraryNavZone)
│   │   ├── BlockFileScreen.tsx
│   │   ├── RoundsScreen.tsx    Round index: list + "New round" button
│   │   └── RoundScreen.tsx     Single round's flow-sheet canvas
│   ├── rounds/             Round lifecycle seam (useRounds, ROUND_KIND, defaultRoundTitle)
│   ├── index.css           Tailwind entry point and design token definitions (@theme)
│   ├── ipc/                Typed IPC bridge to the Rust backend (one wrapper per command)
│   ├── preferences/        App preferences module: Rust-backed theme store, typed section store core, and reactive React bindings
│   │   ├── store/          Namespaced typed preference store core (createPreferenceStore, SectionHandle) and local persistence wrapper (openPreferenceStore, PersistentPreferenceStore)
│   │   └── react/          Reactive React bindings (PreferenceStoreProvider, useSection, usePreferenceValue)
│   ├── documents/          Local document layer (Yjs + IndexedDB)
│   │   ├── core/           DocumentHandle abstraction, DocumentKind enum, and persistence binding
│   │   ├── registry/       Document metadata index (id, kind, title, timestamps) - registry primitive
│   │   ├── service/        Document service - single lifecycle seam (create/open/list/rename/delete)
│   │   └── react/          DocumentsProvider, useDocuments, useDocument, useDocumentService hooks
│   ├── editor/
│   │   ├── core/           Headless Tiptap editor factory with Yjs fragment binding (createEditor)
│   │   ├── marks/          Addressable editor marks: BoldMark, HighlightMark, and font-size scale + helpers
│   │   ├── headings/       Heading node (levels 1-6) and outline query (getOutline, observeOutline)
│   │   ├── preset.ts       Canonical shared extension preset (editorPreset) - feature editors start here
│   │   └── react/          DocumentEditor component and useDocumentEditor hook
│   ├── settings/           Settings screen shell and contribution seam (SettingsScreen, SettingsProvider, defineSettingsContribution)
│   │   └── demo/           Demo contribution that proves the seam end-to-end (safe to delete once real panels land)
│   ├── flow/               Flow-sheet layer: speech-column model, flow-node model, helpers, and XYFlow canvas
│   │   ├── columns.ts      Speech-column model (add/relabel/move/remove, observeColumns)
│   │   ├── nodes.ts        Flow-node model: membership + vertical order, node-container contract
│   │   └── canvas/         FlowSheetPanel (editable), FlowCanvas (render-only), ColumnControls, SpeechColumnNode, column-nodes mapping, node-host (registration API + hosted child nodes), useColumnNodes, useColumns, and useFlowNodes hooks
│   └── test/               Test setup (Vitest + Testing Library)
├── src-tauri/              Rust desktop shell (Tauri v2)
│   └── src/
│       └── commands/       Tauri command handlers (Rust half of the IPC seam)
└── .github/                CI workflows (lint, tests, and Tauri desktop build)
```

## Continuous integration

Pull requests and pushes to `main` run two parallel jobs via GitHub Actions (`.github/workflows/ci.yml`):

- **lint-and-test** - ESLint + Vitest on `ubuntu-latest` (Node only, fast).
- **tauri-build** - `npm run tauri build` on `macos-latest` (smoke-tests the full desktop bundle compile). No code signing or artifact publishing; build failure fails CI.
