# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

## Stack (fixed by the product owner)

- **Tauri v2** - native desktop shell (Rust), config in `src-tauri/`.
- **React + TypeScript + Vite** - front end in `src/`.
- **Tailwind CSS v4** - via the `@tailwindcss/vite` plugin; global styles are `@import "tailwindcss";` in `src/index.css` (no `tailwind.config.js`, no PostCSS config).
- Planned but **not yet added**: Tiptap, Yjs, XYFlow. Do not introduce them until their own tasks land.

The app is strictly **local-first**: nothing in the boot/render path may await a network resource.

## Commands

- `npm run tauri dev` - launch the native desktop window with hot reload.
- `npm run dev` - Vite front end only (browser, no shell).
- `npm run build` - type-check both tsconfigs then `vite build`.
- `npm run tauri build` - native production bundle (first Rust compile is slow and fetches crates).
- `npm test` / `npm run test:watch` - Vitest + React Testing Library.
- `npm run lint` - ESLint (flat config, `eslint.config.js`).

## Sharp edges

- **TypeScript build:** `build` type-checks `tsconfig.json` (app) and `tsconfig.node.json` (Vite config) as two plain `tsc -p ... --noEmit` passes rather than project references, because a composite referenced project may not disable emit (`tsc -b` errors TS6310/TS6306). Keep both `noEmit: true` and do not add `references`/`composite` back without switching the whole setup to solution-style configs.
- **Rust toolchain** must be on `PATH` for any `tauri` command: `source "$HOME/.cargo/env"` if `cargo` is missing.
- **App icons:** `src-tauri/app-icon.svg` is the source of truth. Regenerate the desktop icon set with `npm run tauri icon src-tauri/app-icon.svg` (or a 1024x1024 PNG). The generator also emits iOS/Android/Windows-Store assets; this is a desktop-only app, so keep only `src-tauri/icons/{32x32,64x64,128x128,128x128@2x}.png`, `icon.icns`, `icon.ico`, `icon.png`.

## CI

`.github/workflows/ci.yml` runs lint + Vitest on pull requests (Node only). Packaging the Tauri bundle is intentionally excluded from CI.
