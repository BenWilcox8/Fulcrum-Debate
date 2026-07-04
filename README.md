# Fulcrum Debate

A local-first desktop tool for competitive debaters - flowing rounds, cutting evidence, and building speeches.

The app is a [Tauri v2](https://v2.tauri.app/) desktop shell wrapping a React + TypeScript front end built with [Vite](https://vite.dev/) and styled with [Tailwind CSS](https://tailwindcss.com/).
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
├── src/            React + TypeScript front end
│   ├── App.tsx     The application shell
│   └── test/       Test setup (Vitest + Testing Library)
├── src-tauri/      Rust desktop shell (Tauri v2)
└── .github/        CI workflows (lint, tests, and Tauri desktop build)
```

## Continuous integration

Pull requests and pushes to `main` run two parallel jobs via GitHub Actions (`.github/workflows/ci.yml`):

- **lint-and-test** - ESLint + Vitest on `ubuntu-latest` (Node only, fast).
- **tauri-build** - `npm run tauri build` on `macos-latest` (smoke-tests the full desktop bundle compile). No code signing or artifact publishing; build failure fails CI.
